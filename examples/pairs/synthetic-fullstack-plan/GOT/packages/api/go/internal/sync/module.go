// Package sync provides the fx.Module for the sync bounded context.
// Owns POST /sync (back-compat), POST /sync/jobs, POST /sync/jobs/{id}/execute,
// GET /sync/jobs, GET /sync/jobs/{id}, POST /sync/jobs/{id}/cancel,
// POST /sync/jobs/{id}/execute-async.
//
// fx wiring layered by responsibility:
//
//	pipelines.Factory ← []pipelines.Pipeline group
//	executor.Executor ← pipelines.Factory + syncjob.SyncJobRepository + mediator.InternalMediator + DomainEventRepository
//	usecases.StartSync  ← syncjob.SyncJobRepository + unitofwork.UnitOfWork
//	usecases.ExecuteSync ← executor.Executor
//	usecases.GetSyncStatus ← syncjob.SyncJobRepository
//	usecases.ListSyncJobs  ← syncjob.SyncJobRepository
//	usecases.CancelSync    ← syncjob.SyncJobRepository
//	usecases.AsyncExecuteSync ← executor.Executor (AsyncExecutor interface)
//	controllers.SyncController ← usecases.StartSync + usecases.ExecuteSync
//
// Handlers (OrderUpdatedHandler, ProductUpdatedHandler, ProductVariantUpdatedHandler)
// are provided into the DI graph AND registered with the mediator via fx.Invoke.
// This ensures that executor.syncPublisher.Dispatch(...) reaches the handlers
// and persists entities + wire events before the HTTP response.
//
// Pipelines fed into the `group:"pipelines"` slot:
//   - Shopify orders + products + transactions (real impls)
//   - META × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS} (real impls)
//   - TIKTOK × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS} (real impls)
//   - GOOGLE_ADS × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS} (real impls)
//   - WOOCOMMERCE × orders+products (real implementations)
package sync

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"

	_ "template/api-go/internal/sync/errors" // registers HTTP status codes via init()

	"template/api-go/internal/sync/controllers"
	"template/api-go/internal/sync/enums"
	"template/api-go/internal/sync/handlers"
	repoad "template/api-go/internal/sync/repositories/ad"
	repoadaccount "template/api-go/internal/sync/repositories/adaccount"
	repoadset "template/api-go/internal/sync/repositories/adset"
	repoadspend "template/api-go/internal/sync/repositories/adspend"
	repobusinessaccount "template/api-go/internal/sync/repositories/businessaccount"
	repocampaign "template/api-go/internal/sync/repositories/campaign"
	pixelrepo "template/api-go/internal/sync/repositories/pixel"
	"template/api-go/internal/sync/repositories/syncjob"
	"template/api-go/internal/sync/services/credentials"
	"template/api-go/internal/sync/services/executor"
	woocommercesvc "template/api-go/internal/sync/services/woocommerce"
	"template/api-go/internal/sync/services/pipelines"
	facebookpipelines "template/api-go/internal/sync/services/pipelines/facebook"
	googlepipelines "template/api-go/internal/sync/services/pipelines/google"
	woocommercepipelines "template/api-go/internal/sync/services/pipelines/woocommerce"
	shopifypipelines "template/api-go/internal/sync/services/pipelines/shopify"
	tiktokpipelines "template/api-go/internal/sync/services/pipelines/tiktok"
	"template/api-go/internal/sync/services/pixelthrottle"
	"template/api-go/internal/sync/services/saleschannel"
	shopifysvc "template/api-go/internal/sync/services/shopify"
	storagead "template/api-go/internal/sync/storage/ad"
	storageadaccount "template/api-go/internal/sync/storage/adaccount"
	storageadset "template/api-go/internal/sync/storage/adset"
	storageadspend "template/api-go/internal/sync/storage/adspend"
	storagebusinessaccount "template/api-go/internal/sync/storage/businessaccount"
	storagecampaign "template/api-go/internal/sync/storage/campaign"
	"template/api-go/internal/sync/storage/order"
	storagepixel "template/api-go/internal/sync/storage/pixel"
	"template/api-go/internal/sync/storage/product"
	productvariant "template/api-go/internal/sync/storage/product_variant"
	"template/api-go/internal/sync/storage/transaction"
	"template/api-go/internal/sync/usecases"
	tsclientgen "template/client-go/pkg/typescript"
	wire "template/contracts-go/wire"
	"template/core-go/config"
	corerepos "template/core-go/repositories"
	coremediator "template/core-go/services/mediator"
	"template/core-go/services/unitofwork"
	"template/core-go/types"

	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
)

var Module = fx.Module("sync",
	// --- Shared HTTP client ---
	fx.Provide(func() *http.Client { return &http.Client{} }),

	// --- Shopify HTTP client + normalizers ---
	fx.Provide(shopifysvc.NewShopifyHTTPClient),
	fx.Provide(func(c *shopifysvc.ShopifyHTTPClient) pipelines.ShopifyClient { return c }),
	fx.Provide(func() shopifysvc.OrderNormalizer { return shopifysvc.NewOrdersNormalizer() }),
	fx.Provide(func() shopifysvc.ProductNormalizer { return shopifysvc.NewProductsNormalizer() }),
	fx.Provide(func() shopifysvc.ProductVariantNormalizer { return shopifysvc.NewProductVariantsNormalizer() }),
	fx.Provide(func() shopifysvc.TransactionNormalizer { return shopifysvc.NewTransactionsNormalizer() }),

	// --- Storage constructors (consumed by handlers) ---
	// All four storages now require a UnitOfWork and DomainEventRepository
	// so that Save() does the bulk upsert + outbox insert in one transaction.
	fx.Provide(func(
		db *sql.DB,
		uow unitofwork.UnitOfWork,
		eventRepo corerepos.DomainEventRepository,
	) *order.PgOrderStorage {
		return order.NewPgOrderStorage(db, uow, eventRepo)
	}),
	fx.Provide(func(
		db *sql.DB,
		uow unitofwork.UnitOfWork,
		eventRepo corerepos.DomainEventRepository,
	) *product.PgProductStorage {
		return product.NewPgProductStorage(db, uow, eventRepo)
	}),
	fx.Provide(func(
		db *sql.DB,
		uow unitofwork.UnitOfWork,
		eventRepo corerepos.DomainEventRepository,
	) *productvariant.PgProductVariantStorage {
		return productvariant.NewPgProductVariantStorage(db, uow, eventRepo)
	}),
	fx.Provide(func(
		db *sql.DB,
		uow unitofwork.UnitOfWork,
		eventRepo corerepos.DomainEventRepository,
	) *transaction.PgTransactionStorage {
		return transaction.NewPgTransactionStorage(db, uow, eventRepo)
	}),
	fx.Provide(func(
		db *sql.DB,
		uow unitofwork.UnitOfWork,
		eventRepo corerepos.DomainEventRepository,
	) *storagepixel.PgPixelStorage {
		return storagepixel.NewPgPixelStorage(db, uow, eventRepo)
	}),

	// --- Sales-channel resolver (immutable storeIntegrationId → storeId mapping, cached) ---
	fx.Provide(func(db *sql.DB) *saleschannel.Resolver {
		return saleschannel.NewResolver(saleschannel.NewPgReader(db))
	}),

	// --- Marketing aggregate repositories (simple db-only constructors) ---
	fx.Provide(func(db *sql.DB) repobusinessaccount.BusinessAccountRepository {
		return repobusinessaccount.NewPgBusinessAccountRepository(db)
	}),
	fx.Provide(func(db *sql.DB) repoadaccount.AdAccountRepository {
		return repoadaccount.NewPgAdAccountRepository(db)
	}),
	fx.Provide(func(db *sql.DB) repocampaign.CampaignRepository {
		return repocampaign.NewPgCampaignRepository(db)
	}),
	fx.Provide(func(db *sql.DB) repoadset.AdSetRepository {
		return repoadset.NewPgAdSetRepository(db)
	}),
	fx.Provide(func(db *sql.DB) repoad.AdRepository {
		return repoad.NewPgAdRepository(db)
	}),
	fx.Provide(func(db *sql.DB) repoadspend.AdSpendRepository {
		return repoadspend.NewPgAdSpendRepository(db)
	}),

	// --- Marketing aggregate storages (simple channel-drain, no UoW/outbox) ---
	fx.Provide(func(repo repobusinessaccount.BusinessAccountRepository) *storagebusinessaccount.PgBusinessAccountStorage {
		return storagebusinessaccount.NewPgBusinessAccountStorage(repo)
	}),
	fx.Provide(func(repo repoadaccount.AdAccountRepository) *storageadaccount.PgAdAccountStorage {
		return storageadaccount.NewPgAdAccountStorage(repo)
	}),
	fx.Provide(func(repo repocampaign.CampaignRepository) *storagecampaign.PgCampaignStorage {
		return storagecampaign.NewPgCampaignStorage(repo)
	}),
	fx.Provide(func(repo repoadset.AdSetRepository) *storageadset.PgAdSetStorage {
		return storageadset.NewPgAdSetStorage(repo)
	}),
	fx.Provide(func(repo repoad.AdRepository) *storagead.PgAdStorage {
		return storagead.NewPgAdStorage(repo)
	}),
	fx.Provide(func(repo repoadspend.AdSpendRepository) *storageadspend.PgAdSpendStorage {
		return storageadspend.NewPgAdSpendStorage(repo)
	}),

	// --- SyncJob Postgres repository bound to the SyncJobRepository interface ---
	// The wrapper function returns the interface so fx registers it as
	// syncjob.SyncJobRepository (the type the executor + usecases expect).
	fx.Provide(func(db *sql.DB) syncjob.SyncJobRepository {
		return syncjob.NewPgSyncJobRepository(db)
	}),

	// --- Shopify pipelines registered into group:"pipelines" ---
	fx.Provide(fx.Annotate(
		shopifypipelines.NewShopifyOrdersPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		shopifypipelines.NewShopifyProductsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		shopifypipelines.NewShopifyTransactionsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),

	// --- WooCommerce HTTP client + normalizers ---
	fx.Provide(func() woocommercesvc.PipelineClient {
		return woocommercesvc.NewWooCommerceHTTPClient(woocommercesvc.ClientConfig{})
	}),
	fx.Provide(func() *woocommercesvc.OrderNormalizer { return woocommercesvc.NewOrderNormalizer() }),
	fx.Provide(func() *woocommercesvc.ProductNormalizer { return woocommercesvc.NewProductNormalizer() }),
	fx.Provide(func() *woocommercesvc.ProductVariantNormalizer { return woocommercesvc.NewProductVariantNormalizer() }),

	// --- WooCommerce pipelines — real implementations ---
	fx.Provide(fx.Annotate(
		woocommercepipelines.NewWooCommerceOrdersPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		woocommercepipelines.NewWooCommerceProductsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),

	// --- Facebook (META) pipelines — real implementations ---
	fx.Provide(fx.Annotate(
		facebookpipelines.NewFacebookBusinessAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		facebookpipelines.NewFacebookAdAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		facebookpipelines.NewFacebookCampaignsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		facebookpipelines.NewFacebookMarketingMetricsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),

	// --- TikTok pipelines — real implementations ---
	fx.Provide(fx.Annotate(
		tiktokpipelines.NewTikTokBusinessAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		tiktokpipelines.NewTikTokAdAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		tiktokpipelines.NewTikTokCampaignsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		tiktokpipelines.NewTikTokMarketingMetricsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),

	// --- Google Ads pipelines — real implementations ---
	fx.Provide(fx.Annotate(
		googlepipelines.NewGoogleBusinessAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		googlepipelines.NewGoogleAdAccountsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		googlepipelines.NewGoogleCampaignsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),
	fx.Provide(fx.Annotate(
		googlepipelines.NewGoogleMarketingMetricsPipeline,
		fx.As(new(pipelines.Pipeline)),
		fx.ResultTags(`group:"pipelines"`),
	)),

	// --- PENDING stubs for non-Shopify platforms ---
	fx.Options(pendingPipelineProviders()...),

	// --- Pipeline factory ---
	fx.Provide(fx.Annotate(
		pipelines.NewFactory,
		fx.ParamTags(`group:"pipelines"`),
	)),

	// --- Executor (needs eventRepo for the async path) ---
	fx.Provide(func(
		jobs syncjob.SyncJobRepository,
		factory *pipelines.Factory,
		m coremediator.InternalMediator,
		eventRepo corerepos.DomainEventRepository,
	) *executor.Executor {
		return executor.NewExecutor(jobs, factory, m, eventRepo)
	}),

	// --- Use cases ---
	fx.Provide(usecases.NewStartSync),
	fx.Provide(usecases.NewExecuteSync),
	fx.Provide(usecases.NewGetSyncStatus),
	fx.Provide(usecases.NewListSyncJobs),
	fx.Provide(usecases.NewCancelSync),
	fx.Provide(func(exec *executor.Executor) *usecases.AsyncExecuteSync {
		return usecases.NewAsyncExecuteSync(exec)
	}),

	// --- Handlers (provided so fx knows about them) ---
	// All handlers take only the storage interface (channel-based); the
	// wire event build + outbox write happen inside storage.Save(), not
	// in the handler. Pass concrete types explicitly to satisfy unexported
	// local interface types.
	fx.Provide(func(s *order.PgOrderStorage) *handlers.OrderUpdatedHandler {
		return handlers.NewOrderUpdatedHandler(s)
	}),
	fx.Provide(func(s *product.PgProductStorage) *handlers.ProductUpdatedHandler {
		return handlers.NewProductUpdatedHandler(s)
	}),
	fx.Provide(func(s *productvariant.PgProductVariantStorage) *handlers.ProductVariantUpdatedHandler {
		return handlers.NewProductVariantUpdatedHandler(s)
	}),
	fx.Provide(func(s *transaction.PgTransactionStorage) *handlers.TransactionUpdatedHandler {
		return handlers.NewTransactionUpdatedHandler(s)
	}),

	// --- Marketing aggregate handlers ---
	fx.Provide(func(s *storagebusinessaccount.PgBusinessAccountStorage) *handlers.BusinessAccountUpdatedHandler {
		return handlers.NewBusinessAccountUpdatedHandler(s)
	}),
	fx.Provide(func(s *storageadaccount.PgAdAccountStorage) *handlers.AdAccountUpdatedHandler {
		return handlers.NewAdAccountUpdatedHandler(s)
	}),
	fx.Provide(func(s *storagecampaign.PgCampaignStorage) *handlers.CampaignUpdatedHandler {
		return handlers.NewCampaignUpdatedHandler(s)
	}),
	fx.Provide(func(s *storageadset.PgAdSetStorage) *handlers.AdSetUpdatedHandler {
		return handlers.NewAdSetUpdatedHandler(s)
	}),
	fx.Provide(func(s *storagead.PgAdStorage) *handlers.AdUpdatedHandler {
		return handlers.NewAdUpdatedHandler(s)
	}),
	fx.Provide(func(s *storageadspend.PgAdSpendStorage) *handlers.AdSpendRecordedHandler {
		return handlers.NewAdSpendRecordedHandler(s)
	}),
	fx.Provide(func(cfg *config.Config) (*redis.Client, error) {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			return nil, err
		}
		return redis.NewClient(opts), nil
	}),
	fx.Provide(func(c *redis.Client) pixelthrottle.Throttle { return pixelthrottle.NewRedisThrottle(c) }),
	fx.Provide(func(db *sql.DB) pixelrepo.ReadRepository { return pixelrepo.NewPgReadRepository(db) }),
	fx.Provide(func(s *storagepixel.PgPixelStorage, r *saleschannel.Resolver, th pixelthrottle.Throttle, rr pixelrepo.ReadRepository) *handlers.PixelEventRecordedHandler {
		return handlers.NewPixelEventRecordedHandler(s, r, th, rr)
	}),

	// --- CRITICAL: Register handlers with the mediator ---
	// Without this, executor.syncPublisher.Dispatch reaches no handler
	// and nothing persists. This is the linchpin wiring for the sync path.
	// The same handlers are also available for Spec B's webhook flow.
	fx.Invoke(func(
		m coremediator.InternalMediator,
		oh *handlers.OrderUpdatedHandler,
		ph *handlers.ProductUpdatedHandler,
		vh *handlers.ProductVariantUpdatedHandler,
		th *handlers.TransactionUpdatedHandler,
		bah *handlers.BusinessAccountUpdatedHandler,
		aah *handlers.AdAccountUpdatedHandler,
		ch *handlers.CampaignUpdatedHandler,
		ash *handlers.AdSetUpdatedHandler,
		adh *handlers.AdUpdatedHandler,
		sph *handlers.AdSpendRecordedHandler,
		peh *handlers.PixelEventRecordedHandler,
	) {
		m.Register(oh)
		m.Register(ph)
		m.Register(vh)
		m.Register(th)
		m.Register(bah)
		m.Register(aah)
		m.Register(ch)
		m.Register(ash)
		m.Register(adh)
		m.Register(sph)
		m.Register(peh)
	}),

	// --- Integration-activated handler: exchanges creds + starts sync async ---
	fx.Provide(func(client *tsclientgen.ClientWithResponses) credentials.Exchanger {
		return credentials.NewClientExchanger(client)
	}),
	fx.Provide(func(uc *usecases.StartSync) handlers.SyncStarter {
		return &startSyncAdapter{uc: uc}
	}),
	fx.Provide(func(exec *executor.Executor) handlers.AsyncExecutor { return exec }),
	fx.Provide(handlers.NewIntegrationActivatedHandler),

	// Register the integration-activated handler with the external mediator so the
	// Task-2 Redis consumer delivers the stream entry to it.
	fx.Invoke(func(em coremediator.ExternalMediator, h *handlers.IntegrationActivatedHandler) {
		em.Register(h)
	}),

	// --- PurchaseOrderRecordedHandler: appends audit rows to procurement.purchase_order_audit ---
	fx.Provide(func(db *sql.DB) *handlers.PgPurchaseOrderAuditRepository {
		return handlers.NewPgPurchaseOrderAuditRepository(db)
	}),
	fx.Provide(func(repo *handlers.PgPurchaseOrderAuditRepository) *handlers.PurchaseOrderRecordedHandler {
		return handlers.NewPurchaseOrderRecordedHandler(repo)
	}),
	fx.Invoke(func(em coremediator.ExternalMediator, h *handlers.PurchaseOrderRecordedHandler) {
		em.Register(h)
	}),

	// --- Start storage background drain loops ---
	// Each storage exposes a blocking Start(ctx) that drains the input channel.
	// They MUST run in goroutines; calling Start synchronously in OnStart would
	// hang the fx app-start phase. Close() signals shutdown on OnStop.
	fx.Invoke(startStorageLoops),

	// --- Controllers ---
	fx.Provide(fx.Annotate(
		controllers.NewSyncController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewStartSyncController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewExecuteSyncController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewGetSyncStatusController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewListSyncJobsController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewCancelSyncController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
	fx.Provide(fx.Annotate(
		controllers.NewAsyncExecuteSyncController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),
)

// pendingPipelineProviders builds fx providers for each
// (platform, name) pair that has no real implementation yet.
// Each provider returns a PendingPipeline that surfaces ErrPipelinePending.
//
// Registered: SHOPIFY + WOOCOMMERCE × new kinds (DISPUTES, MARKETING_METRICS,
// MARKETING_METRICS_CONCURRENT, MARKETING_METRICS_TWO_PHASE, CAMPAIGNS).
// TRANSACTIONS is intentionally excluded because NewShopifyTransactionsPipeline
// is the real impl for (SHOPIFY, TRANSACTIONS); adding it here would collide in
// the factory (last-write-wins) and risk shadowing the real pipeline.
//
// Marketing platforms are fully implemented (not pending):
//   - META × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS}
//   - TIKTOK × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS}
//   - GOOGLE_ADS × {BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS}
func pendingPipelineProviders() []fx.Option {
	// SHOPIFY + WOOCOMMERCE × new kinds (TRANSACTIONS excluded). Only ORDERS and
	// PRODUCTS have real implementations for these platforms; the rest pending.
	allPlatforms := []wire.SalesPlatform{wire.SalesPlatformSHOPIFY, wire.SalesPlatformWOOCOMMERCE}
	newNames := []enums.SyncPipelineName{
		enums.SyncPipelineDisputes,
		enums.SyncPipelineMarketingMetrics,
		enums.SyncPipelineMarketingMetricsConcurrent,
		enums.SyncPipelineMarketingMetricsTwoPhase,
		enums.SyncPipelineCampaigns,
	}

	out := make([]fx.Option, 0, len(allPlatforms)*len(newNames))

	for _, p := range allPlatforms {
		for _, n := range newNames {
			plat := p
			name := n
			out = append(out, fx.Provide(fx.Annotate(
				func() pipelines.Pipeline { return pipelines.NewPendingPipeline(plat, name) },
				fx.ResultTags(`group:"pipelines"`),
			)))
		}
	}

	return out
}

type storageParams struct {
	fx.In

	Lifecycle        fx.Lifecycle
	Orders           *order.PgOrderStorage
	Products         *product.PgProductStorage
	ProductVariants  *productvariant.PgProductVariantStorage
	Transactions     *transaction.PgTransactionStorage
	BusinessAccounts *storagebusinessaccount.PgBusinessAccountStorage
	AdAccounts       *storageadaccount.PgAdAccountStorage
	Campaigns        *storagecampaign.PgCampaignStorage
	AdSets           *storageadset.PgAdSetStorage
	Ads              *storagead.PgAdStorage
	AdSpends         *storageadspend.PgAdSpendStorage
	Pixel            *storagepixel.PgPixelStorage
}

// startStorageLoops registers fx lifecycle hooks that launch each storage's
// blocking drain loop in its own goroutine on app start and close the channel
// on app stop.  Start MUST run in a goroutine — it blocks until Close() is
// called, so calling it synchronously inside OnStart would hang the fx
// app-start phase.
func startStorageLoops(p storageParams) {
	p.Lifecycle.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				slog.Info("order storage started")
				if err := p.Orders.Start(context.Background()); err != nil {
					slog.Error("order storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("product storage started")
				if err := p.Products.Start(context.Background()); err != nil {
					slog.Error("product storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("product variant storage started")
				if err := p.ProductVariants.Start(context.Background()); err != nil {
					slog.Error("product variant storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("transaction storage started")
				if err := p.Transactions.Start(context.Background()); err != nil {
					slog.Error("transaction storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("business account storage started")
				if err := p.BusinessAccounts.Start(context.Background()); err != nil {
					slog.Error("business account storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("ad account storage started")
				if err := p.AdAccounts.Start(context.Background()); err != nil {
					slog.Error("ad account storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("campaign storage started")
				if err := p.Campaigns.Start(context.Background()); err != nil {
					slog.Error("campaign storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("ad set storage started")
				if err := p.AdSets.Start(context.Background()); err != nil {
					slog.Error("ad set storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("ad storage started")
				if err := p.Ads.Start(context.Background()); err != nil {
					slog.Error("ad storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("ad spend storage started")
				if err := p.AdSpends.Start(context.Background()); err != nil {
					slog.Error("ad spend storage stopped", "error", err)
				}
			}()
			go func() {
				slog.Info("pixel storage started")
				if err := p.Pixel.Start(context.Background()); err != nil {
					slog.Error("pixel storage stopped", "error", err)
				}
			}()
			return nil
		},
		OnStop: func(_ context.Context) error {
			slog.Info("closing storage channels")
			p.Orders.Close()
			p.Products.Close()
			p.ProductVariants.Close()
			p.Transactions.Close()
			p.BusinessAccounts.Close()
			p.AdAccounts.Close()
			p.Campaigns.Close()
			p.AdSets.Close()
			p.Ads.Close()
			p.AdSpends.Close()
			p.Pixel.Close()
			return nil
		},
	})
}

// startSyncAdapter bridges handlers.SyncStarter → usecases.StartSync.
type startSyncAdapter struct{ uc *usecases.StartSync }

func (a *startSyncAdapter) Start(ctx context.Context, in handlers.StartSyncArgs) (string, error) {
	out, err := a.uc.Execute(ctx, usecases.StartSyncInput{
		StoreID:                    in.StoreID,
		StoreIntegrationID:         in.StoreIntegrationID,
		StoreIntegrationExternalID: in.StoreIntegrationExternalID,
		Platform:                   string(in.Platform),
		Pipelines:                  in.Pipelines,
	})
	if err != nil {
		return "", err
	}
	return out.ID, nil
}

// Compile-time assertions that handlers satisfy the mediator interface.
var _ coremediator.DomainEventHandler = (*handlers.OrderUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.ProductUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.ProductVariantUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.TransactionUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.BusinessAccountUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.AdAccountUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.CampaignUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.AdSetUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.AdUpdatedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.AdSpendRecordedHandler)(nil)
var _ coremediator.DomainEventHandler = (*handlers.PixelEventRecordedHandler)(nil)
var _ coremediator.IntegrationEventHandler = (*handlers.IntegrationActivatedHandler)(nil)
var _ coremediator.IntegrationEventHandler = (*handlers.PurchaseOrderRecordedHandler)(nil)
