package whatsapp

import (
	"testing"

	"go.mau.fi/whatsmeow/store"
)

// O NOME DO PRODUTO no par de dispositivo — o texto que o cliente vê em "Aparelhos conectados"
// no celular dele.
//
// ── o defeito que estes casos existem para não deixar voltar ─────────────────────────────────────
// Era a constante `"ZapGo"` cravada num `init()`: o nome de OUTRO produto, num lugar que nenhuma
// configuração alcançava. `init()` roda no import do pacote — antes de `config.Load`, antes de
// qualquer env existir —, então não havia como consertar sem tirar a atribuição de lá.
//
// Agora vem de `PRODUCT_NAME` (core `Config.ProductName`), a MESMA chave que o daemon TS usa no
// cabeçalho dos e-mails transacionais. Um install, um nome.

func TestSetDeviceProps_StampsTheProductName(t *testing.T) {
	t.Cleanup(func() { store.DeviceProps.Os = nil })

	SetDeviceProps("Acme Chat")

	if store.DeviceProps.Os == nil {
		t.Fatal("o nome do produto não foi carimbado — o cliente veria o default do whatsmeow")
	}
	if got := store.DeviceProps.GetOs(); got != "Acme Chat" {
		t.Fatalf("nome exibido = %q, esperado %q", got, "Acme Chat")
	}
}

// Nome vazio NÃO apaga o que já está lá.
//
// Um `PRODUCT_NAME=` no `.env` deixaria o campo nulo e o cliente veria o default do whatsmeow —
// sem erro, sem log, marca errada. Qual é o default do produto é decisão do `config.Load` (que
// resolve `"Your Product"`), nunca desta função.
func TestSetDeviceProps_BlankNameDoesNotErase(t *testing.T) {
	t.Cleanup(func() { store.DeviceProps.Os = nil })

	SetDeviceProps("Acme Chat")
	SetDeviceProps("")
	SetDeviceProps("   ")

	if got := store.DeviceProps.GetOs(); got != "Acme Chat" {
		t.Fatalf("um nome vazio apagou a marca: %q", got)
	}
}

// O que o `init()` AINDA faz, e por que é só isto.
//
// `PlatformType` é constante — não depende de configuração nenhuma, então pode ser carimbado no
// import. Se um dia alguém devolver o nome do produto para o `init()`, este caso continua verde e
// o de cima é quem acusa; é a divisão que mantém a regra legível.
func TestInit_StampsOnlyTheConstantPlatformType(t *testing.T) {
	if store.DeviceProps.PlatformType == nil {
		t.Fatal("PlatformType deveria ser carimbado no init — é constante")
	}
	if store.DeviceProps.Os != nil {
		t.Fatal("o init NÃO pode carimbar o nome exibido: ele roda antes de config.Load, então só saberia uma constante")
	}
}
