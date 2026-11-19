#[allow(unused_imports)]
pub use progenitor_client::{ByteStream, Error, ResponseValue};
#[allow(unused_imports)]
use progenitor_client::{encode_path, RequestBuilderExt};
/// Types used as operation parameters and responses.
#[allow(clippy::all)]
pub mod types {
    /// Error types.
    pub mod error {
        /// Error from a `TryFrom` or `FromStr` implementation.
        pub struct ConversionError(::std::borrow::Cow<'static, str>);
        impl ::std::error::Error for ConversionError {}
        impl ::std::fmt::Display for ConversionError {
            fn fmt(
                &self,
                f: &mut ::std::fmt::Formatter<'_>,
            ) -> Result<(), ::std::fmt::Error> {
                ::std::fmt::Display::fmt(&self.0, f)
            }
        }
        impl ::std::fmt::Debug for ConversionError {
            fn fmt(
                &self,
                f: &mut ::std::fmt::Formatter<'_>,
            ) -> Result<(), ::std::fmt::Error> {
                ::std::fmt::Debug::fmt(&self.0, f)
            }
        }
        impl From<&'static str> for ConversionError {
            fn from(value: &'static str) -> Self {
                Self(value.into())
            }
        }
        impl From<String> for ConversionError {
            fn from(value: String) -> Self {
                Self(value.into())
            }
        }
    }
    ///All possible error codes
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "description": "All possible error codes",
    ///  "type": "string",
    ///  "enum": [
    ///    "AGENT_ENTRY_FORBIDS_SENDER",
    ///    "AGENT_RUN_SCOPE_MISMATCH",
    ///    "AGENT_RUN_TOKEN_INVALID",
    ///    "AGENT_STOP_KIND_NOT_DECLARABLE",
    ///    "AGENT_TOOLS_UNSUPPORTED",
    ///    "AGENT_TRANSPORT_STOP_NOT_DECLARABLE",
    ///    "ARTIFACT_FILE_MISSING",
    ///    "ARTIFACT_NOT_FOUND",
    ///    "ARTIFACT_NOT_PREVIEWABLE",
    ///    "ARTIFACT_TOO_LARGE",
    ///    "ASK_ANSWER_REQUIRED",
    ///    "ASK_DEFAULT_REQUIRED",
    ///    "ASK_NOT_DUE",
    ///    "ASK_OPTIONS_DUPLICATED",
    ///    "ASK_OPTION_UNKNOWN",
    ///    "BATCH_ISSUE_NOT_IN_THREAD",
    ///    "BATCH_ITEMS_MISMATCH",
    ///    "BATCH_NOT_FOUND",
    ///    "CANNOT_CONVERT_INPUT",
    ///    "CHANNEL_MEDIA_UNSUPPORTED",
    ///    "CHANNEL_NOT_CONNECTED",
    ///    "CLARIFICATION_ALREADY_PENDING",
    ///    "CLASSIFICATION_FAILED",
    ///    "CLOUD_UNREACHABLE",
    ///    "COMMAND_HANDLER_NOT_FOUND",
    ///    "COMMAND_QUEUE_NOT_FOUND",
    ///    "CONTACT_AVATAR_NOT_FOUND",
    ///    "CONTACT_ENTRY_REQUIRES_SENDER",
    ///    "CREDENTIAL_DECRYPT_FAILED",
    ///    "DATA_DIR_LOCKED",
    ///    "EMAIL_ALREADY_REGISTERED",
    ///    "ENTITY_NOT_FOUND_WHILE_SAVING",
    ///    "ENTRY_NOT_FOUND",
    ///    "ENTRY_NOT_INVOCABLE",
    ///    "FORBIDDEN",
    ///    "GATEWAY_UNAVAILABLE",
    ///    "HANDLER_NOT_BOUND",
    ///    "HEALTH_NOT_SAMPLED",
    ///    "INVALIDATED_AUTH_TOKEN",
    ///    "INVALID_AUTH_TOKEN",
    ///    "INVALID_CONTROLLER_EXAMPLES",
    ///    "INVALID_EMAIL",
    ///    "INVALID_EMAIL_FORMAT",
    ///    "INVALID_ENTITY",
    ///    "INVALID_ID",
    ///    "INVALID_ID_VALUES_LENGTH",
    ///    "INVALID_LANGUAGE",
    ///    "INVALID_LOOP_INTERVAL",
    ///    "INVALID_LOOP_TIME",
    ///    "INVALID_OUTBOX_PAYLOAD",
    ///    "INVALID_PHONE",
    ///    "INVALID_PICTURE_URL",
    ///    "INVALID_RANGE",
    ///    "INVALID_REQUEST",
    ///    "INVALID_TIMEZONE",
    ///    "ISSUE_ALREADY_ARCHIVED",
    ///    "ISSUE_ALREADY_COMPLETED",
    ///    "ISSUE_ALREADY_PAUSED",
    ///    "ISSUE_ARCHIVED",
    ///    "ISSUE_NOT_ARCHIVED",
    ///    "ISSUE_NOT_COMPLETED",
    ///    "ISSUE_NOT_FOUND",
    ///    "ISSUE_NOT_PAUSABLE",
    ///    "ISSUE_NOT_PAUSED",
    ///    "ISSUE_NOT_REOPENABLE",
    ///    "ISSUE_PAUSED",
    ///    "LAST_INVOKER",
    ///    "LOOP_NOT_FOUND",
    ///    "LOOP_PROMPT_TOO_LONG",
    ///    "LOOP_WITHOUT_WEEKDAY",
    ///    "MIGRATIONS_PENDING",
    ///    "MISSING_ENVIRONMENT_VARIABLE",
    ///    "MISSING_LOG_CONTENT",
    ///    "MODEL_NOT_AVAILABLE",
    ///    "NOT_FOUND",
    ///    "NOT_IMPLEMENTED",
    ///    "NO_CHANNEL_CONNECTED",
    ///    "NO_PROVIDER_SELECTED",
    ///    "ONBOARDING_DRAFT_INCOMPLETE",
    ///    "ONBOARDING_NOT_COMPLETED",
    ///    "OPTIMISTIC_LOCK_CONFLICT",
    ///    "OWNER_ALREADY_DISABLED",
    ///    "OWNER_NOT_DISABLED",
    ///    "OWNER_NOT_FOUND",
    ///    "PANEL_ACTION_RATE_LIMITED",
    ///    "PANEL_CANNOT_RELEASE",
    ///    "PANEL_CODE_ATTEMPTS_EXCEEDED",
    ///    "PANEL_CODE_EXPIRED",
    ///    "PANEL_CODE_INVALID",
    ///    "PANEL_CODE_RATE_LIMITED",
    ///    "PANEL_LINK_UNAVAILABLE",
    ///    "PANEL_MEMBER_NOT_FOUND",
    ///    "PANEL_NOT_FOUND",
    ///    "PANEL_RESOLUTION_NOT_OFFERED",
    ///    "PARTICIPANT_CANNOT_ACT",
    ///    "PARTICIPANT_CANNOT_RELEASE",
    ///    "PARTICIPANT_NOT_FOUND",
    ///    "PASSWORDS_DONT_MATCH",
    ///    "PASSWORD_TOO_WEAK",
    ///    "PATH_NOT_A_DIRECTORY",
    ///    "PATH_NOT_FOUND",
    ///    "PROMPT_TOO_LONG",
    ///    "PROVIDER_COMING_SOON",
    ///    "PROVIDER_NOT_BOUND",
    ///    "PROVIDER_NOT_DETECTED",
    ///    "QUOTED_ENTRY_NOT_IN_THREAD",
    ///    "RATE_LIMITED",
    ///    "RESOLUTION_NOT_APPLICABLE",
    ///    "SESSION_ALREADY_STREAMING",
    ///    "SIGNAL_ALREADY_FLUSHED",
    ///    "SOCIAL_SIGN_IN_FAILED",
    ///    "STOP_ALREADY_RESOLVED",
    ///    "STOP_CRITERION_DISABLED",
    ///    "STOP_NOT_FOUND",
    ///    "STOP_NOT_IN_THREAD",
    ///    "TERMINAL_SPAWN_FAILED",
    ///    "THREAD_ALREADY_ATTACHED",
    ///    "THREAD_ALREADY_DELETED",
    ///    "THREAD_HAS_ACTIVE_WORK",
    ///    "THREAD_NOT_FOUND",
    ///    "THREAD_NOT_PAUSED",
    ///    "THREAD_PAUSED",
    ///    "THROUGHPUT_NOT_READY",
    ///    "TOO_MANY_TERMINAL_STREAMS",
    ///    "UNAUTHORIZED",
    ///    "USER_NOT_FOUND",
    ///    "VALIDATION_ERROR",
    ///    "WEAK_PASSWORD",
    ///    "WORKSPACE_ALREADY_REGISTERED",
    ///    "WORKSPACE_IN_USE",
    ///    "WORKSPACE_NOT_FOUND"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(
        ::serde::Deserialize,
        ::serde::Serialize,
        Clone,
        Copy,
        Debug,
        Eq,
        Hash,
        Ord,
        PartialEq,
        PartialOrd
    )]
    pub enum ApiErrors {
        #[serde(rename = "AGENT_ENTRY_FORBIDS_SENDER")]
        AgentEntryForbidsSender,
        #[serde(rename = "AGENT_RUN_SCOPE_MISMATCH")]
        AgentRunScopeMismatch,
        #[serde(rename = "AGENT_RUN_TOKEN_INVALID")]
        AgentRunTokenInvalid,
        #[serde(rename = "AGENT_STOP_KIND_NOT_DECLARABLE")]
        AgentStopKindNotDeclarable,
        #[serde(rename = "AGENT_TOOLS_UNSUPPORTED")]
        AgentToolsUnsupported,
        #[serde(rename = "AGENT_TRANSPORT_STOP_NOT_DECLARABLE")]
        AgentTransportStopNotDeclarable,
        #[serde(rename = "ARTIFACT_FILE_MISSING")]
        ArtifactFileMissing,
        #[serde(rename = "ARTIFACT_NOT_FOUND")]
        ArtifactNotFound,
        #[serde(rename = "ARTIFACT_NOT_PREVIEWABLE")]
        ArtifactNotPreviewable,
        #[serde(rename = "ARTIFACT_TOO_LARGE")]
        ArtifactTooLarge,
        #[serde(rename = "ASK_ANSWER_REQUIRED")]
        AskAnswerRequired,
        #[serde(rename = "ASK_DEFAULT_REQUIRED")]
        AskDefaultRequired,
        #[serde(rename = "ASK_NOT_DUE")]
        AskNotDue,
        #[serde(rename = "ASK_OPTIONS_DUPLICATED")]
        AskOptionsDuplicated,
        #[serde(rename = "ASK_OPTION_UNKNOWN")]
        AskOptionUnknown,
        #[serde(rename = "BATCH_ISSUE_NOT_IN_THREAD")]
        BatchIssueNotInThread,
        #[serde(rename = "BATCH_ITEMS_MISMATCH")]
        BatchItemsMismatch,
        #[serde(rename = "BATCH_NOT_FOUND")]
        BatchNotFound,
        #[serde(rename = "CANNOT_CONVERT_INPUT")]
        CannotConvertInput,
        #[serde(rename = "CHANNEL_MEDIA_UNSUPPORTED")]
        ChannelMediaUnsupported,
        #[serde(rename = "CHANNEL_NOT_CONNECTED")]
        ChannelNotConnected,
        #[serde(rename = "CLARIFICATION_ALREADY_PENDING")]
        ClarificationAlreadyPending,
        #[serde(rename = "CLASSIFICATION_FAILED")]
        ClassificationFailed,
        #[serde(rename = "CLOUD_UNREACHABLE")]
        CloudUnreachable,
        #[serde(rename = "COMMAND_HANDLER_NOT_FOUND")]
        CommandHandlerNotFound,
        #[serde(rename = "COMMAND_QUEUE_NOT_FOUND")]
        CommandQueueNotFound,
        #[serde(rename = "CONTACT_AVATAR_NOT_FOUND")]
        ContactAvatarNotFound,
        #[serde(rename = "CONTACT_ENTRY_REQUIRES_SENDER")]
        ContactEntryRequiresSender,
        #[serde(rename = "CREDENTIAL_DECRYPT_FAILED")]
        CredentialDecryptFailed,
        #[serde(rename = "DATA_DIR_LOCKED")]
        DataDirLocked,
        #[serde(rename = "EMAIL_ALREADY_REGISTERED")]
        EmailAlreadyRegistered,
        #[serde(rename = "ENTITY_NOT_FOUND_WHILE_SAVING")]
        EntityNotFoundWhileSaving,
        #[serde(rename = "ENTRY_NOT_FOUND")]
        EntryNotFound,
        #[serde(rename = "ENTRY_NOT_INVOCABLE")]
        EntryNotInvocable,
        #[serde(rename = "FORBIDDEN")]
        Forbidden,
        #[serde(rename = "GATEWAY_UNAVAILABLE")]
        GatewayUnavailable,
        #[serde(rename = "HANDLER_NOT_BOUND")]
        HandlerNotBound,
        #[serde(rename = "HEALTH_NOT_SAMPLED")]
        HealthNotSampled,
        #[serde(rename = "INVALIDATED_AUTH_TOKEN")]
        InvalidatedAuthToken,
        #[serde(rename = "INVALID_AUTH_TOKEN")]
        InvalidAuthToken,
        #[serde(rename = "INVALID_CONTROLLER_EXAMPLES")]
        InvalidControllerExamples,
        #[serde(rename = "INVALID_EMAIL")]
        InvalidEmail,
        #[serde(rename = "INVALID_EMAIL_FORMAT")]
        InvalidEmailFormat,
        #[serde(rename = "INVALID_ENTITY")]
        InvalidEntity,
        #[serde(rename = "INVALID_ID")]
        InvalidId,
        #[serde(rename = "INVALID_ID_VALUES_LENGTH")]
        InvalidIdValuesLength,
        #[serde(rename = "INVALID_LANGUAGE")]
        InvalidLanguage,
        #[serde(rename = "INVALID_LOOP_INTERVAL")]
        InvalidLoopInterval,
        #[serde(rename = "INVALID_LOOP_TIME")]
        InvalidLoopTime,
        #[serde(rename = "INVALID_OUTBOX_PAYLOAD")]
        InvalidOutboxPayload,
        #[serde(rename = "INVALID_PHONE")]
        InvalidPhone,
        #[serde(rename = "INVALID_PICTURE_URL")]
        InvalidPictureUrl,
        #[serde(rename = "INVALID_RANGE")]
        InvalidRange,
        #[serde(rename = "INVALID_REQUEST")]
        InvalidRequest,
        #[serde(rename = "INVALID_TIMEZONE")]
        InvalidTimezone,
        #[serde(rename = "ISSUE_ALREADY_ARCHIVED")]
        IssueAlreadyArchived,
        #[serde(rename = "ISSUE_ALREADY_COMPLETED")]
        IssueAlreadyCompleted,
        #[serde(rename = "ISSUE_ALREADY_PAUSED")]
        IssueAlreadyPaused,
        #[serde(rename = "ISSUE_ARCHIVED")]
        IssueArchived,
        #[serde(rename = "ISSUE_NOT_ARCHIVED")]
        IssueNotArchived,
        #[serde(rename = "ISSUE_NOT_COMPLETED")]
        IssueNotCompleted,
        #[serde(rename = "ISSUE_NOT_FOUND")]
        IssueNotFound,
        #[serde(rename = "ISSUE_NOT_PAUSABLE")]
        IssueNotPausable,
        #[serde(rename = "ISSUE_NOT_PAUSED")]
        IssueNotPaused,
        #[serde(rename = "ISSUE_NOT_REOPENABLE")]
        IssueNotReopenable,
        #[serde(rename = "ISSUE_PAUSED")]
        IssuePaused,
        #[serde(rename = "LAST_INVOKER")]
        LastInvoker,
        #[serde(rename = "LOOP_NOT_FOUND")]
        LoopNotFound,
        #[serde(rename = "LOOP_PROMPT_TOO_LONG")]
        LoopPromptTooLong,
        #[serde(rename = "LOOP_WITHOUT_WEEKDAY")]
        LoopWithoutWeekday,
        #[serde(rename = "MIGRATIONS_PENDING")]
        MigrationsPending,
        #[serde(rename = "MISSING_ENVIRONMENT_VARIABLE")]
        MissingEnvironmentVariable,
        #[serde(rename = "MISSING_LOG_CONTENT")]
        MissingLogContent,
        #[serde(rename = "MODEL_NOT_AVAILABLE")]
        ModelNotAvailable,
        #[serde(rename = "NOT_FOUND")]
        NotFound,
        #[serde(rename = "NOT_IMPLEMENTED")]
        NotImplemented,
        #[serde(rename = "NO_CHANNEL_CONNECTED")]
        NoChannelConnected,
        #[serde(rename = "NO_PROVIDER_SELECTED")]
        NoProviderSelected,
        #[serde(rename = "ONBOARDING_DRAFT_INCOMPLETE")]
        OnboardingDraftIncomplete,
        #[serde(rename = "ONBOARDING_NOT_COMPLETED")]
        OnboardingNotCompleted,
        #[serde(rename = "OPTIMISTIC_LOCK_CONFLICT")]
        OptimisticLockConflict,
        #[serde(rename = "OWNER_ALREADY_DISABLED")]
        OwnerAlreadyDisabled,
        #[serde(rename = "OWNER_NOT_DISABLED")]
        OwnerNotDisabled,
        #[serde(rename = "OWNER_NOT_FOUND")]
        OwnerNotFound,
        #[serde(rename = "PANEL_ACTION_RATE_LIMITED")]
        PanelActionRateLimited,
        #[serde(rename = "PANEL_CANNOT_RELEASE")]
        PanelCannotRelease,
        #[serde(rename = "PANEL_CODE_ATTEMPTS_EXCEEDED")]
        PanelCodeAttemptsExceeded,
        #[serde(rename = "PANEL_CODE_EXPIRED")]
        PanelCodeExpired,
        #[serde(rename = "PANEL_CODE_INVALID")]
        PanelCodeInvalid,
        #[serde(rename = "PANEL_CODE_RATE_LIMITED")]
        PanelCodeRateLimited,
        #[serde(rename = "PANEL_LINK_UNAVAILABLE")]
        PanelLinkUnavailable,
        #[serde(rename = "PANEL_MEMBER_NOT_FOUND")]
        PanelMemberNotFound,
        #[serde(rename = "PANEL_NOT_FOUND")]
        PanelNotFound,
        #[serde(rename = "PANEL_RESOLUTION_NOT_OFFERED")]
        PanelResolutionNotOffered,
        #[serde(rename = "PARTICIPANT_CANNOT_ACT")]
        ParticipantCannotAct,
        #[serde(rename = "PARTICIPANT_CANNOT_RELEASE")]
        ParticipantCannotRelease,
        #[serde(rename = "PARTICIPANT_NOT_FOUND")]
        ParticipantNotFound,
        #[serde(rename = "PASSWORDS_DONT_MATCH")]
        PasswordsDontMatch,
        #[serde(rename = "PASSWORD_TOO_WEAK")]
        PasswordTooWeak,
        #[serde(rename = "PATH_NOT_A_DIRECTORY")]
        PathNotADirectory,
        #[serde(rename = "PATH_NOT_FOUND")]
        PathNotFound,
        #[serde(rename = "PROMPT_TOO_LONG")]
        PromptTooLong,
        #[serde(rename = "PROVIDER_COMING_SOON")]
        ProviderComingSoon,
        #[serde(rename = "PROVIDER_NOT_BOUND")]
        ProviderNotBound,
        #[serde(rename = "PROVIDER_NOT_DETECTED")]
        ProviderNotDetected,
        #[serde(rename = "QUOTED_ENTRY_NOT_IN_THREAD")]
        QuotedEntryNotInThread,
        #[serde(rename = "RATE_LIMITED")]
        RateLimited,
        #[serde(rename = "RESOLUTION_NOT_APPLICABLE")]
        ResolutionNotApplicable,
        #[serde(rename = "SESSION_ALREADY_STREAMING")]
        SessionAlreadyStreaming,
        #[serde(rename = "SIGNAL_ALREADY_FLUSHED")]
        SignalAlreadyFlushed,
        #[serde(rename = "SOCIAL_SIGN_IN_FAILED")]
        SocialSignInFailed,
        #[serde(rename = "STOP_ALREADY_RESOLVED")]
        StopAlreadyResolved,
        #[serde(rename = "STOP_CRITERION_DISABLED")]
        StopCriterionDisabled,
        #[serde(rename = "STOP_NOT_FOUND")]
        StopNotFound,
        #[serde(rename = "STOP_NOT_IN_THREAD")]
        StopNotInThread,
        #[serde(rename = "TERMINAL_SPAWN_FAILED")]
        TerminalSpawnFailed,
        #[serde(rename = "THREAD_ALREADY_ATTACHED")]
        ThreadAlreadyAttached,
        #[serde(rename = "THREAD_ALREADY_DELETED")]
        ThreadAlreadyDeleted,
        #[serde(rename = "THREAD_HAS_ACTIVE_WORK")]
        ThreadHasActiveWork,
        #[serde(rename = "THREAD_NOT_FOUND")]
        ThreadNotFound,
        #[serde(rename = "THREAD_NOT_PAUSED")]
        ThreadNotPaused,
        #[serde(rename = "THREAD_PAUSED")]
        ThreadPaused,
        #[serde(rename = "THROUGHPUT_NOT_READY")]
        ThroughputNotReady,
        #[serde(rename = "TOO_MANY_TERMINAL_STREAMS")]
        TooManyTerminalStreams,
        #[serde(rename = "UNAUTHORIZED")]
        Unauthorized,
        #[serde(rename = "USER_NOT_FOUND")]
        UserNotFound,
        #[serde(rename = "VALIDATION_ERROR")]
        ValidationError,
        #[serde(rename = "WEAK_PASSWORD")]
        WeakPassword,
        #[serde(rename = "WORKSPACE_ALREADY_REGISTERED")]
        WorkspaceAlreadyRegistered,
        #[serde(rename = "WORKSPACE_IN_USE")]
        WorkspaceInUse,
        #[serde(rename = "WORKSPACE_NOT_FOUND")]
        WorkspaceNotFound,
    }
    impl ::std::convert::From<&Self> for ApiErrors {
        fn from(value: &ApiErrors) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ApiErrors {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::AgentEntryForbidsSender => {
                    f.write_str("AGENT_ENTRY_FORBIDS_SENDER")
                }
                Self::AgentRunScopeMismatch => f.write_str("AGENT_RUN_SCOPE_MISMATCH"),
                Self::AgentRunTokenInvalid => f.write_str("AGENT_RUN_TOKEN_INVALID"),
                Self::AgentStopKindNotDeclarable => {
                    f.write_str("AGENT_STOP_KIND_NOT_DECLARABLE")
                }
                Self::AgentToolsUnsupported => f.write_str("AGENT_TOOLS_UNSUPPORTED"),
                Self::AgentTransportStopNotDeclarable => {
                    f.write_str("AGENT_TRANSPORT_STOP_NOT_DECLARABLE")
                }
                Self::ArtifactFileMissing => f.write_str("ARTIFACT_FILE_MISSING"),
                Self::ArtifactNotFound => f.write_str("ARTIFACT_NOT_FOUND"),
                Self::ArtifactNotPreviewable => f.write_str("ARTIFACT_NOT_PREVIEWABLE"),
                Self::ArtifactTooLarge => f.write_str("ARTIFACT_TOO_LARGE"),
                Self::AskAnswerRequired => f.write_str("ASK_ANSWER_REQUIRED"),
                Self::AskDefaultRequired => f.write_str("ASK_DEFAULT_REQUIRED"),
                Self::AskNotDue => f.write_str("ASK_NOT_DUE"),
                Self::AskOptionsDuplicated => f.write_str("ASK_OPTIONS_DUPLICATED"),
                Self::AskOptionUnknown => f.write_str("ASK_OPTION_UNKNOWN"),
                Self::BatchIssueNotInThread => f.write_str("BATCH_ISSUE_NOT_IN_THREAD"),
                Self::BatchItemsMismatch => f.write_str("BATCH_ITEMS_MISMATCH"),
                Self::BatchNotFound => f.write_str("BATCH_NOT_FOUND"),
                Self::CannotConvertInput => f.write_str("CANNOT_CONVERT_INPUT"),
                Self::ChannelMediaUnsupported => f.write_str("CHANNEL_MEDIA_UNSUPPORTED"),
                Self::ChannelNotConnected => f.write_str("CHANNEL_NOT_CONNECTED"),
                Self::ClarificationAlreadyPending => {
                    f.write_str("CLARIFICATION_ALREADY_PENDING")
                }
                Self::ClassificationFailed => f.write_str("CLASSIFICATION_FAILED"),
                Self::CloudUnreachable => f.write_str("CLOUD_UNREACHABLE"),
                Self::CommandHandlerNotFound => f.write_str("COMMAND_HANDLER_NOT_FOUND"),
                Self::CommandQueueNotFound => f.write_str("COMMAND_QUEUE_NOT_FOUND"),
                Self::ContactAvatarNotFound => f.write_str("CONTACT_AVATAR_NOT_FOUND"),
                Self::ContactEntryRequiresSender => {
                    f.write_str("CONTACT_ENTRY_REQUIRES_SENDER")
                }
                Self::CredentialDecryptFailed => f.write_str("CREDENTIAL_DECRYPT_FAILED"),
                Self::DataDirLocked => f.write_str("DATA_DIR_LOCKED"),
                Self::EmailAlreadyRegistered => f.write_str("EMAIL_ALREADY_REGISTERED"),
                Self::EntityNotFoundWhileSaving => {
                    f.write_str("ENTITY_NOT_FOUND_WHILE_SAVING")
                }
                Self::EntryNotFound => f.write_str("ENTRY_NOT_FOUND"),
                Self::EntryNotInvocable => f.write_str("ENTRY_NOT_INVOCABLE"),
                Self::Forbidden => f.write_str("FORBIDDEN"),
                Self::GatewayUnavailable => f.write_str("GATEWAY_UNAVAILABLE"),
                Self::HandlerNotBound => f.write_str("HANDLER_NOT_BOUND"),
                Self::HealthNotSampled => f.write_str("HEALTH_NOT_SAMPLED"),
                Self::InvalidatedAuthToken => f.write_str("INVALIDATED_AUTH_TOKEN"),
                Self::InvalidAuthToken => f.write_str("INVALID_AUTH_TOKEN"),
                Self::InvalidControllerExamples => {
                    f.write_str("INVALID_CONTROLLER_EXAMPLES")
                }
                Self::InvalidEmail => f.write_str("INVALID_EMAIL"),
                Self::InvalidEmailFormat => f.write_str("INVALID_EMAIL_FORMAT"),
                Self::InvalidEntity => f.write_str("INVALID_ENTITY"),
                Self::InvalidId => f.write_str("INVALID_ID"),
                Self::InvalidIdValuesLength => f.write_str("INVALID_ID_VALUES_LENGTH"),
                Self::InvalidLanguage => f.write_str("INVALID_LANGUAGE"),
                Self::InvalidLoopInterval => f.write_str("INVALID_LOOP_INTERVAL"),
                Self::InvalidLoopTime => f.write_str("INVALID_LOOP_TIME"),
                Self::InvalidOutboxPayload => f.write_str("INVALID_OUTBOX_PAYLOAD"),
                Self::InvalidPhone => f.write_str("INVALID_PHONE"),
                Self::InvalidPictureUrl => f.write_str("INVALID_PICTURE_URL"),
                Self::InvalidRange => f.write_str("INVALID_RANGE"),
                Self::InvalidRequest => f.write_str("INVALID_REQUEST"),
                Self::InvalidTimezone => f.write_str("INVALID_TIMEZONE"),
                Self::IssueAlreadyArchived => f.write_str("ISSUE_ALREADY_ARCHIVED"),
                Self::IssueAlreadyCompleted => f.write_str("ISSUE_ALREADY_COMPLETED"),
                Self::IssueAlreadyPaused => f.write_str("ISSUE_ALREADY_PAUSED"),
                Self::IssueArchived => f.write_str("ISSUE_ARCHIVED"),
                Self::IssueNotArchived => f.write_str("ISSUE_NOT_ARCHIVED"),
                Self::IssueNotCompleted => f.write_str("ISSUE_NOT_COMPLETED"),
                Self::IssueNotFound => f.write_str("ISSUE_NOT_FOUND"),
                Self::IssueNotPausable => f.write_str("ISSUE_NOT_PAUSABLE"),
                Self::IssueNotPaused => f.write_str("ISSUE_NOT_PAUSED"),
                Self::IssueNotReopenable => f.write_str("ISSUE_NOT_REOPENABLE"),
                Self::IssuePaused => f.write_str("ISSUE_PAUSED"),
                Self::LastInvoker => f.write_str("LAST_INVOKER"),
                Self::LoopNotFound => f.write_str("LOOP_NOT_FOUND"),
                Self::LoopPromptTooLong => f.write_str("LOOP_PROMPT_TOO_LONG"),
                Self::LoopWithoutWeekday => f.write_str("LOOP_WITHOUT_WEEKDAY"),
                Self::MigrationsPending => f.write_str("MIGRATIONS_PENDING"),
                Self::MissingEnvironmentVariable => {
                    f.write_str("MISSING_ENVIRONMENT_VARIABLE")
                }
                Self::MissingLogContent => f.write_str("MISSING_LOG_CONTENT"),
                Self::ModelNotAvailable => f.write_str("MODEL_NOT_AVAILABLE"),
                Self::NotFound => f.write_str("NOT_FOUND"),
                Self::NotImplemented => f.write_str("NOT_IMPLEMENTED"),
                Self::NoChannelConnected => f.write_str("NO_CHANNEL_CONNECTED"),
                Self::NoProviderSelected => f.write_str("NO_PROVIDER_SELECTED"),
                Self::OnboardingDraftIncomplete => {
                    f.write_str("ONBOARDING_DRAFT_INCOMPLETE")
                }
                Self::OnboardingNotCompleted => f.write_str("ONBOARDING_NOT_COMPLETED"),
                Self::OptimisticLockConflict => f.write_str("OPTIMISTIC_LOCK_CONFLICT"),
                Self::OwnerAlreadyDisabled => f.write_str("OWNER_ALREADY_DISABLED"),
                Self::OwnerNotDisabled => f.write_str("OWNER_NOT_DISABLED"),
                Self::OwnerNotFound => f.write_str("OWNER_NOT_FOUND"),
                Self::PanelActionRateLimited => f.write_str("PANEL_ACTION_RATE_LIMITED"),
                Self::PanelCannotRelease => f.write_str("PANEL_CANNOT_RELEASE"),
                Self::PanelCodeAttemptsExceeded => {
                    f.write_str("PANEL_CODE_ATTEMPTS_EXCEEDED")
                }
                Self::PanelCodeExpired => f.write_str("PANEL_CODE_EXPIRED"),
                Self::PanelCodeInvalid => f.write_str("PANEL_CODE_INVALID"),
                Self::PanelCodeRateLimited => f.write_str("PANEL_CODE_RATE_LIMITED"),
                Self::PanelLinkUnavailable => f.write_str("PANEL_LINK_UNAVAILABLE"),
                Self::PanelMemberNotFound => f.write_str("PANEL_MEMBER_NOT_FOUND"),
                Self::PanelNotFound => f.write_str("PANEL_NOT_FOUND"),
                Self::PanelResolutionNotOffered => {
                    f.write_str("PANEL_RESOLUTION_NOT_OFFERED")
                }
                Self::ParticipantCannotAct => f.write_str("PARTICIPANT_CANNOT_ACT"),
                Self::ParticipantCannotRelease => {
                    f.write_str("PARTICIPANT_CANNOT_RELEASE")
                }
                Self::ParticipantNotFound => f.write_str("PARTICIPANT_NOT_FOUND"),
                Self::PasswordsDontMatch => f.write_str("PASSWORDS_DONT_MATCH"),
                Self::PasswordTooWeak => f.write_str("PASSWORD_TOO_WEAK"),
                Self::PathNotADirectory => f.write_str("PATH_NOT_A_DIRECTORY"),
                Self::PathNotFound => f.write_str("PATH_NOT_FOUND"),
                Self::PromptTooLong => f.write_str("PROMPT_TOO_LONG"),
                Self::ProviderComingSoon => f.write_str("PROVIDER_COMING_SOON"),
                Self::ProviderNotBound => f.write_str("PROVIDER_NOT_BOUND"),
                Self::ProviderNotDetected => f.write_str("PROVIDER_NOT_DETECTED"),
                Self::QuotedEntryNotInThread => f.write_str("QUOTED_ENTRY_NOT_IN_THREAD"),
                Self::RateLimited => f.write_str("RATE_LIMITED"),
                Self::ResolutionNotApplicable => f.write_str("RESOLUTION_NOT_APPLICABLE"),
                Self::SessionAlreadyStreaming => f.write_str("SESSION_ALREADY_STREAMING"),
                Self::SignalAlreadyFlushed => f.write_str("SIGNAL_ALREADY_FLUSHED"),
                Self::SocialSignInFailed => f.write_str("SOCIAL_SIGN_IN_FAILED"),
                Self::StopAlreadyResolved => f.write_str("STOP_ALREADY_RESOLVED"),
                Self::StopCriterionDisabled => f.write_str("STOP_CRITERION_DISABLED"),
                Self::StopNotFound => f.write_str("STOP_NOT_FOUND"),
                Self::StopNotInThread => f.write_str("STOP_NOT_IN_THREAD"),
                Self::TerminalSpawnFailed => f.write_str("TERMINAL_SPAWN_FAILED"),
                Self::ThreadAlreadyAttached => f.write_str("THREAD_ALREADY_ATTACHED"),
                Self::ThreadAlreadyDeleted => f.write_str("THREAD_ALREADY_DELETED"),
                Self::ThreadHasActiveWork => f.write_str("THREAD_HAS_ACTIVE_WORK"),
                Self::ThreadNotFound => f.write_str("THREAD_NOT_FOUND"),
                Self::ThreadNotPaused => f.write_str("THREAD_NOT_PAUSED"),
                Self::ThreadPaused => f.write_str("THREAD_PAUSED"),
                Self::ThroughputNotReady => f.write_str("THROUGHPUT_NOT_READY"),
                Self::TooManyTerminalStreams => f.write_str("TOO_MANY_TERMINAL_STREAMS"),
                Self::Unauthorized => f.write_str("UNAUTHORIZED"),
                Self::UserNotFound => f.write_str("USER_NOT_FOUND"),
                Self::ValidationError => f.write_str("VALIDATION_ERROR"),
                Self::WeakPassword => f.write_str("WEAK_PASSWORD"),
                Self::WorkspaceAlreadyRegistered => {
                    f.write_str("WORKSPACE_ALREADY_REGISTERED")
                }
                Self::WorkspaceInUse => f.write_str("WORKSPACE_IN_USE"),
                Self::WorkspaceNotFound => f.write_str("WORKSPACE_NOT_FOUND"),
            }
        }
    }
    impl ::std::str::FromStr for ApiErrors {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "AGENT_ENTRY_FORBIDS_SENDER" => Ok(Self::AgentEntryForbidsSender),
                "AGENT_RUN_SCOPE_MISMATCH" => Ok(Self::AgentRunScopeMismatch),
                "AGENT_RUN_TOKEN_INVALID" => Ok(Self::AgentRunTokenInvalid),
                "AGENT_STOP_KIND_NOT_DECLARABLE" => Ok(Self::AgentStopKindNotDeclarable),
                "AGENT_TOOLS_UNSUPPORTED" => Ok(Self::AgentToolsUnsupported),
                "AGENT_TRANSPORT_STOP_NOT_DECLARABLE" => {
                    Ok(Self::AgentTransportStopNotDeclarable)
                }
                "ARTIFACT_FILE_MISSING" => Ok(Self::ArtifactFileMissing),
                "ARTIFACT_NOT_FOUND" => Ok(Self::ArtifactNotFound),
                "ARTIFACT_NOT_PREVIEWABLE" => Ok(Self::ArtifactNotPreviewable),
                "ARTIFACT_TOO_LARGE" => Ok(Self::ArtifactTooLarge),
                "ASK_ANSWER_REQUIRED" => Ok(Self::AskAnswerRequired),
                "ASK_DEFAULT_REQUIRED" => Ok(Self::AskDefaultRequired),
                "ASK_NOT_DUE" => Ok(Self::AskNotDue),
                "ASK_OPTIONS_DUPLICATED" => Ok(Self::AskOptionsDuplicated),
                "ASK_OPTION_UNKNOWN" => Ok(Self::AskOptionUnknown),
                "BATCH_ISSUE_NOT_IN_THREAD" => Ok(Self::BatchIssueNotInThread),
                "BATCH_ITEMS_MISMATCH" => Ok(Self::BatchItemsMismatch),
                "BATCH_NOT_FOUND" => Ok(Self::BatchNotFound),
                "CANNOT_CONVERT_INPUT" => Ok(Self::CannotConvertInput),
                "CHANNEL_MEDIA_UNSUPPORTED" => Ok(Self::ChannelMediaUnsupported),
                "CHANNEL_NOT_CONNECTED" => Ok(Self::ChannelNotConnected),
                "CLARIFICATION_ALREADY_PENDING" => Ok(Self::ClarificationAlreadyPending),
                "CLASSIFICATION_FAILED" => Ok(Self::ClassificationFailed),
                "CLOUD_UNREACHABLE" => Ok(Self::CloudUnreachable),
                "COMMAND_HANDLER_NOT_FOUND" => Ok(Self::CommandHandlerNotFound),
                "COMMAND_QUEUE_NOT_FOUND" => Ok(Self::CommandQueueNotFound),
                "CONTACT_AVATAR_NOT_FOUND" => Ok(Self::ContactAvatarNotFound),
                "CONTACT_ENTRY_REQUIRES_SENDER" => Ok(Self::ContactEntryRequiresSender),
                "CREDENTIAL_DECRYPT_FAILED" => Ok(Self::CredentialDecryptFailed),
                "DATA_DIR_LOCKED" => Ok(Self::DataDirLocked),
                "EMAIL_ALREADY_REGISTERED" => Ok(Self::EmailAlreadyRegistered),
                "ENTITY_NOT_FOUND_WHILE_SAVING" => Ok(Self::EntityNotFoundWhileSaving),
                "ENTRY_NOT_FOUND" => Ok(Self::EntryNotFound),
                "ENTRY_NOT_INVOCABLE" => Ok(Self::EntryNotInvocable),
                "FORBIDDEN" => Ok(Self::Forbidden),
                "GATEWAY_UNAVAILABLE" => Ok(Self::GatewayUnavailable),
                "HANDLER_NOT_BOUND" => Ok(Self::HandlerNotBound),
                "HEALTH_NOT_SAMPLED" => Ok(Self::HealthNotSampled),
                "INVALIDATED_AUTH_TOKEN" => Ok(Self::InvalidatedAuthToken),
                "INVALID_AUTH_TOKEN" => Ok(Self::InvalidAuthToken),
                "INVALID_CONTROLLER_EXAMPLES" => Ok(Self::InvalidControllerExamples),
                "INVALID_EMAIL" => Ok(Self::InvalidEmail),
                "INVALID_EMAIL_FORMAT" => Ok(Self::InvalidEmailFormat),
                "INVALID_ENTITY" => Ok(Self::InvalidEntity),
                "INVALID_ID" => Ok(Self::InvalidId),
                "INVALID_ID_VALUES_LENGTH" => Ok(Self::InvalidIdValuesLength),
                "INVALID_LANGUAGE" => Ok(Self::InvalidLanguage),
                "INVALID_LOOP_INTERVAL" => Ok(Self::InvalidLoopInterval),
                "INVALID_LOOP_TIME" => Ok(Self::InvalidLoopTime),
                "INVALID_OUTBOX_PAYLOAD" => Ok(Self::InvalidOutboxPayload),
                "INVALID_PHONE" => Ok(Self::InvalidPhone),
                "INVALID_PICTURE_URL" => Ok(Self::InvalidPictureUrl),
                "INVALID_RANGE" => Ok(Self::InvalidRange),
                "INVALID_REQUEST" => Ok(Self::InvalidRequest),
                "INVALID_TIMEZONE" => Ok(Self::InvalidTimezone),
                "ISSUE_ALREADY_ARCHIVED" => Ok(Self::IssueAlreadyArchived),
                "ISSUE_ALREADY_COMPLETED" => Ok(Self::IssueAlreadyCompleted),
                "ISSUE_ALREADY_PAUSED" => Ok(Self::IssueAlreadyPaused),
                "ISSUE_ARCHIVED" => Ok(Self::IssueArchived),
                "ISSUE_NOT_ARCHIVED" => Ok(Self::IssueNotArchived),
                "ISSUE_NOT_COMPLETED" => Ok(Self::IssueNotCompleted),
                "ISSUE_NOT_FOUND" => Ok(Self::IssueNotFound),
                "ISSUE_NOT_PAUSABLE" => Ok(Self::IssueNotPausable),
                "ISSUE_NOT_PAUSED" => Ok(Self::IssueNotPaused),
                "ISSUE_NOT_REOPENABLE" => Ok(Self::IssueNotReopenable),
                "ISSUE_PAUSED" => Ok(Self::IssuePaused),
                "LAST_INVOKER" => Ok(Self::LastInvoker),
                "LOOP_NOT_FOUND" => Ok(Self::LoopNotFound),
                "LOOP_PROMPT_TOO_LONG" => Ok(Self::LoopPromptTooLong),
                "LOOP_WITHOUT_WEEKDAY" => Ok(Self::LoopWithoutWeekday),
                "MIGRATIONS_PENDING" => Ok(Self::MigrationsPending),
                "MISSING_ENVIRONMENT_VARIABLE" => Ok(Self::MissingEnvironmentVariable),
                "MISSING_LOG_CONTENT" => Ok(Self::MissingLogContent),
                "MODEL_NOT_AVAILABLE" => Ok(Self::ModelNotAvailable),
                "NOT_FOUND" => Ok(Self::NotFound),
                "NOT_IMPLEMENTED" => Ok(Self::NotImplemented),
                "NO_CHANNEL_CONNECTED" => Ok(Self::NoChannelConnected),
                "NO_PROVIDER_SELECTED" => Ok(Self::NoProviderSelected),
                "ONBOARDING_DRAFT_INCOMPLETE" => Ok(Self::OnboardingDraftIncomplete),
                "ONBOARDING_NOT_COMPLETED" => Ok(Self::OnboardingNotCompleted),
                "OPTIMISTIC_LOCK_CONFLICT" => Ok(Self::OptimisticLockConflict),
                "OWNER_ALREADY_DISABLED" => Ok(Self::OwnerAlreadyDisabled),
                "OWNER_NOT_DISABLED" => Ok(Self::OwnerNotDisabled),
                "OWNER_NOT_FOUND" => Ok(Self::OwnerNotFound),
                "PANEL_ACTION_RATE_LIMITED" => Ok(Self::PanelActionRateLimited),
                "PANEL_CANNOT_RELEASE" => Ok(Self::PanelCannotRelease),
                "PANEL_CODE_ATTEMPTS_EXCEEDED" => Ok(Self::PanelCodeAttemptsExceeded),
                "PANEL_CODE_EXPIRED" => Ok(Self::PanelCodeExpired),
                "PANEL_CODE_INVALID" => Ok(Self::PanelCodeInvalid),
                "PANEL_CODE_RATE_LIMITED" => Ok(Self::PanelCodeRateLimited),
                "PANEL_LINK_UNAVAILABLE" => Ok(Self::PanelLinkUnavailable),
                "PANEL_MEMBER_NOT_FOUND" => Ok(Self::PanelMemberNotFound),
                "PANEL_NOT_FOUND" => Ok(Self::PanelNotFound),
                "PANEL_RESOLUTION_NOT_OFFERED" => Ok(Self::PanelResolutionNotOffered),
                "PARTICIPANT_CANNOT_ACT" => Ok(Self::ParticipantCannotAct),
                "PARTICIPANT_CANNOT_RELEASE" => Ok(Self::ParticipantCannotRelease),
                "PARTICIPANT_NOT_FOUND" => Ok(Self::ParticipantNotFound),
                "PASSWORDS_DONT_MATCH" => Ok(Self::PasswordsDontMatch),
                "PASSWORD_TOO_WEAK" => Ok(Self::PasswordTooWeak),
                "PATH_NOT_A_DIRECTORY" => Ok(Self::PathNotADirectory),
                "PATH_NOT_FOUND" => Ok(Self::PathNotFound),
                "PROMPT_TOO_LONG" => Ok(Self::PromptTooLong),
                "PROVIDER_COMING_SOON" => Ok(Self::ProviderComingSoon),
                "PROVIDER_NOT_BOUND" => Ok(Self::ProviderNotBound),
                "PROVIDER_NOT_DETECTED" => Ok(Self::ProviderNotDetected),
                "QUOTED_ENTRY_NOT_IN_THREAD" => Ok(Self::QuotedEntryNotInThread),
                "RATE_LIMITED" => Ok(Self::RateLimited),
                "RESOLUTION_NOT_APPLICABLE" => Ok(Self::ResolutionNotApplicable),
                "SESSION_ALREADY_STREAMING" => Ok(Self::SessionAlreadyStreaming),
                "SIGNAL_ALREADY_FLUSHED" => Ok(Self::SignalAlreadyFlushed),
                "SOCIAL_SIGN_IN_FAILED" => Ok(Self::SocialSignInFailed),
                "STOP_ALREADY_RESOLVED" => Ok(Self::StopAlreadyResolved),
                "STOP_CRITERION_DISABLED" => Ok(Self::StopCriterionDisabled),
                "STOP_NOT_FOUND" => Ok(Self::StopNotFound),
                "STOP_NOT_IN_THREAD" => Ok(Self::StopNotInThread),
                "TERMINAL_SPAWN_FAILED" => Ok(Self::TerminalSpawnFailed),
                "THREAD_ALREADY_ATTACHED" => Ok(Self::ThreadAlreadyAttached),
                "THREAD_ALREADY_DELETED" => Ok(Self::ThreadAlreadyDeleted),
                "THREAD_HAS_ACTIVE_WORK" => Ok(Self::ThreadHasActiveWork),
                "THREAD_NOT_FOUND" => Ok(Self::ThreadNotFound),
                "THREAD_NOT_PAUSED" => Ok(Self::ThreadNotPaused),
                "THREAD_PAUSED" => Ok(Self::ThreadPaused),
                "THROUGHPUT_NOT_READY" => Ok(Self::ThroughputNotReady),
                "TOO_MANY_TERMINAL_STREAMS" => Ok(Self::TooManyTerminalStreams),
                "UNAUTHORIZED" => Ok(Self::Unauthorized),
                "USER_NOT_FOUND" => Ok(Self::UserNotFound),
                "VALIDATION_ERROR" => Ok(Self::ValidationError),
                "WEAK_PASSWORD" => Ok(Self::WeakPassword),
                "WORKSPACE_ALREADY_REGISTERED" => Ok(Self::WorkspaceAlreadyRegistered),
                "WORKSPACE_IN_USE" => Ok(Self::WorkspaceInUse),
                "WORKSPACE_NOT_FOUND" => Ok(Self::WorkspaceNotFound),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ApiErrors {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ApiErrors {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ApiErrors {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`AskAnswer`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "optionId"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "OPTION"
    ///          ]
    ///        },
    ///        "optionId": {
    ///          "type": "string",
    ///          "maxLength": 40,
    ///          "minLength": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "text"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "TEXT"
    ///          ]
    ///        },
    ///        "text": {
    ///          "type": "string",
    ///          "maxLength": 2000,
    ///          "minLength": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", deny_unknown_fields)]
    pub enum AskAnswer {
        #[serde(rename = "OPTION")]
        Option { #[serde(rename = "optionId")] option_id: AskAnswerOptionId },
        #[serde(rename = "TEXT")]
        Text { text: AskAnswerText },
    }
    impl ::std::convert::From<&Self> for AskAnswer {
        fn from(value: &AskAnswer) -> Self {
            value.clone()
        }
    }
    ///`AskAnswerOptionId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 40,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AskAnswerOptionId(::std::string::String);
    impl ::std::ops::Deref for AskAnswerOptionId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AskAnswerOptionId> for ::std::string::String {
        fn from(value: AskAnswerOptionId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AskAnswerOptionId> for AskAnswerOptionId {
        fn from(value: &AskAnswerOptionId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AskAnswerOptionId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 40usize {
                return Err("longer than 40 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AskAnswerOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AskAnswerOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AskAnswerOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AskAnswerOptionId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`AskAnswerText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 2000,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AskAnswerText(::std::string::String);
    impl ::std::ops::Deref for AskAnswerText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AskAnswerText> for ::std::string::String {
        fn from(value: AskAnswerText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AskAnswerText> for AskAnswerText {
        fn from(value: &AskAnswerText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AskAnswerText {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 2000usize {
                return Err("longer than 2000 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AskAnswerText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AskAnswerText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AskAnswerText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AskAnswerText {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`AskOption`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "label"
    ///  ],
    ///  "properties": {
    ///    "authorizes": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/AskEffect"
    ///      }
    ///    },
    ///    "id": {
    ///      "type": "string",
    ///      "maxLength": 40,
    ///      "minLength": 1
    ///    },
    ///    "label": {
    ///      "type": "string",
    ///      "maxLength": 200,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AskOption {
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub authorizes: ::std::vec::Vec<::codm_contracts_rust::wire::enums::AskEffect>,
        pub id: AskOptionId,
        pub label: AskOptionLabel,
    }
    impl ::std::convert::From<&AskOption> for AskOption {
        fn from(value: &AskOption) -> Self {
            value.clone()
        }
    }
    ///`AskOptionId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 40,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AskOptionId(::std::string::String);
    impl ::std::ops::Deref for AskOptionId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AskOptionId> for ::std::string::String {
        fn from(value: AskOptionId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AskOptionId> for AskOptionId {
        fn from(value: &AskOptionId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AskOptionId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 40usize {
                return Err("longer than 40 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AskOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AskOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AskOptionId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AskOptionId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`AskOptionLabel`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 200,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AskOptionLabel(::std::string::String);
    impl ::std::ops::Deref for AskOptionLabel {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AskOptionLabel> for ::std::string::String {
        fn from(value: AskOptionLabel) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AskOptionLabel> for AskOptionLabel {
        fn from(value: &AskOptionLabel) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AskOptionLabel {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 200usize {
                return Err("longer than 200 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AskOptionLabel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AskOptionLabel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AskOptionLabel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AskOptionLabel {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`Batch`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "items",
    ///    "sourceEntryId",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string",
    ///      "maxLength": 20,
    ///      "minLength": 1
    ///    },
    ///    "items": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/BatchItem"
    ///      },
    ///      "maxItems": 50
    ///    },
    ///    "sourceEntryId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/BatchStatus"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct Batch {
        pub code: BatchCode,
        pub items: ::std::vec::Vec<BatchItem>,
        #[serde(rename = "sourceEntryId")]
        pub source_entry_id: ::uuid::Uuid,
        pub status: ::codm_contracts_rust::wire::enums::BatchStatus,
    }
    impl ::std::convert::From<&Batch> for Batch {
        fn from(value: &Batch) -> Self {
            value.clone()
        }
    }
    ///`BatchCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 20,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct BatchCode(::std::string::String);
    impl ::std::ops::Deref for BatchCode {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<BatchCode> for ::std::string::String {
        fn from(value: BatchCode) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&BatchCode> for BatchCode {
        fn from(value: &BatchCode) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for BatchCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 20usize {
                return Err("longer than 20 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for BatchCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for BatchCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for BatchCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for BatchCode {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`BatchItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "excerpt",
    ///    "n"
    ///  ],
    ///  "properties": {
    ///    "destination": {
    ///      "allOf": [
    ///        {
    ///          "$ref": "#/components/schemas/BatchItemDestination"
    ///        }
    ///      ]
    ///    },
    ///    "excerpt": {
    ///      "type": "string",
    ///      "maxLength": 500
    ///    },
    ///    "n": {
    ///      "type": "integer",
    ///      "maximum": 50.0,
    ///      "minimum": 1.0
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct BatchItem {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub destination: ::std::option::Option<BatchItemDestination>,
        pub excerpt: BatchItemExcerpt,
        pub n: ::std::num::NonZeroU64,
    }
    impl ::std::convert::From<&BatchItem> for BatchItem {
        fn from(value: &BatchItem) -> Self {
            value.clone()
        }
    }
    ///`BatchItemDestination`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "NEW_ISSUE"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ATTACHED"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "note"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ALREADY_LIVE"
    ///          ]
    ///        },
    ///        "note": {
    ///          "type": "string",
    ///          "maxLength": 500,
    ///          "minLength": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "reason"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DECLINED"
    ///          ]
    ///        },
    ///        "reason": {
    ///          "type": "string",
    ///          "maxLength": 500,
    ///          "minLength": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "reason"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DEFERRED"
    ///          ]
    ///        },
    ///        "reason": {
    ///          "type": "string",
    ///          "maxLength": 500,
    ///          "minLength": 1
    ///        },
    ///        "until": {
    ///          "type": "string",
    ///          "format": "date-time",
    ///          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "NEEDS_DECISION"
    ///          ]
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind")]
    pub enum BatchItemDestination {
        #[serde(rename = "NEW_ISSUE")]
        NewIssue { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "ATTACHED")]
        Attached { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "ALREADY_LIVE")]
        AlreadyLive {
            #[serde(
                rename = "issueId",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            issue_id: ::std::option::Option<::uuid::Uuid>,
            note: BatchItemDestinationNote,
        },
        #[serde(rename = "DECLINED")]
        Declined { reason: BatchItemDestinationReason },
        #[serde(rename = "DEFERRED")]
        Deferred {
            reason: BatchItemDestinationReason,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            until: ::std::option::Option<::chrono::DateTime<::chrono::offset::Utc>>,
        },
        #[serde(rename = "NEEDS_DECISION")]
        NeedsDecision {
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
    }
    impl ::std::convert::From<&Self> for BatchItemDestination {
        fn from(value: &BatchItemDestination) -> Self {
            value.clone()
        }
    }
    ///`BatchItemDestinationNote`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 500,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct BatchItemDestinationNote(::std::string::String);
    impl ::std::ops::Deref for BatchItemDestinationNote {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<BatchItemDestinationNote> for ::std::string::String {
        fn from(value: BatchItemDestinationNote) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&BatchItemDestinationNote> for BatchItemDestinationNote {
        fn from(value: &BatchItemDestinationNote) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for BatchItemDestinationNote {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 500usize {
                return Err("longer than 500 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for BatchItemDestinationNote {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for BatchItemDestinationNote {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for BatchItemDestinationNote {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for BatchItemDestinationNote {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`BatchItemDestinationReason`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 500,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct BatchItemDestinationReason(::std::string::String);
    impl ::std::ops::Deref for BatchItemDestinationReason {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<BatchItemDestinationReason> for ::std::string::String {
        fn from(value: BatchItemDestinationReason) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&BatchItemDestinationReason>
    for BatchItemDestinationReason {
        fn from(value: &BatchItemDestinationReason) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for BatchItemDestinationReason {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 500usize {
                return Err("longer than 500 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for BatchItemDestinationReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for BatchItemDestinationReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for BatchItemDestinationReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for BatchItemDestinationReason {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`BatchItemExcerpt`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 500
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct BatchItemExcerpt(::std::string::String);
    impl ::std::ops::Deref for BatchItemExcerpt {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<BatchItemExcerpt> for ::std::string::String {
        fn from(value: BatchItemExcerpt) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&BatchItemExcerpt> for BatchItemExcerpt {
        fn from(value: &BatchItemExcerpt) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for BatchItemExcerpt {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 500usize {
                return Err("longer than 500 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for BatchItemExcerpt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for BatchItemExcerpt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for BatchItemExcerpt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for BatchItemExcerpt {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`ClaimSignInCodeResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ClaimSignInCodeResponse {
        pub code: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&ClaimSignInCodeResponse> for ClaimSignInCodeResponse {
        fn from(value: &ClaimSignInCodeResponse) -> Self {
            value.clone()
        }
    }
    ///`CreateOwnerBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "kind": {
    ///      "$ref": "#/components/schemas/OwnerKind"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    },
    ///    "pictureUrl": {
    ///      "type": "string",
    ///      "format": "uri"
    ///    },
    ///    "timezone": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CreateOwnerBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub kind: ::std::option::Option<::codm_contracts_rust::wire::enums::OwnerKind>,
        pub name: CreateOwnerBodyName,
        #[serde(
            rename = "pictureUrl",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub picture_url: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub timezone: ::std::option::Option<CreateOwnerBodyTimezone>,
    }
    impl ::std::convert::From<&CreateOwnerBody> for CreateOwnerBody {
        fn from(value: &CreateOwnerBody) -> Self {
            value.clone()
        }
    }
    ///`CreateOwnerBodyName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct CreateOwnerBodyName(::std::string::String);
    impl ::std::ops::Deref for CreateOwnerBodyName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<CreateOwnerBodyName> for ::std::string::String {
        fn from(value: CreateOwnerBodyName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&CreateOwnerBodyName> for CreateOwnerBodyName {
        fn from(value: &CreateOwnerBodyName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for CreateOwnerBodyName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for CreateOwnerBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for CreateOwnerBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for CreateOwnerBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for CreateOwnerBodyName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`CreateOwnerBodyTimezone`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct CreateOwnerBodyTimezone(::std::string::String);
    impl ::std::ops::Deref for CreateOwnerBodyTimezone {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<CreateOwnerBodyTimezone> for ::std::string::String {
        fn from(value: CreateOwnerBodyTimezone) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&CreateOwnerBodyTimezone> for CreateOwnerBodyTimezone {
        fn from(value: &CreateOwnerBodyTimezone) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for CreateOwnerBodyTimezone {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for CreateOwnerBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for CreateOwnerBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for CreateOwnerBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for CreateOwnerBodyTimezone {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`CreateOwnerResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "ownerId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct CreateOwnerResponse {
        #[serde(rename = "ownerId")]
        pub owner_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&CreateOwnerResponse> for CreateOwnerResponse {
        fn from(value: &CreateOwnerResponse) -> Self {
            value.clone()
        }
    }
    ///`DisableOwnerBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "reason": {
    ///      "type": "string",
    ///      "maxLength": 500,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct DisableOwnerBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub reason: ::std::option::Option<DisableOwnerBodyReason>,
    }
    impl ::std::convert::From<&DisableOwnerBody> for DisableOwnerBody {
        fn from(value: &DisableOwnerBody) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for DisableOwnerBody {
        fn default() -> Self {
            Self { reason: Default::default() }
        }
    }
    ///`DisableOwnerBodyReason`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 500,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct DisableOwnerBodyReason(::std::string::String);
    impl ::std::ops::Deref for DisableOwnerBodyReason {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<DisableOwnerBodyReason> for ::std::string::String {
        fn from(value: DisableOwnerBodyReason) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&DisableOwnerBodyReason> for DisableOwnerBodyReason {
        fn from(value: &DisableOwnerBodyReason) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for DisableOwnerBodyReason {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 500usize {
                return Err("longer than 500 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for DisableOwnerBodyReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for DisableOwnerBodyReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for DisableOwnerBodyReason {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for DisableOwnerBodyReason {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`DisableOwnerResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "isDisabled",
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "isDisabled": {
    ///      "type": "boolean"
    ///    },
    ///    "ownerId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct DisableOwnerResponse {
        #[serde(rename = "isDisabled")]
        pub is_disabled: bool,
        #[serde(rename = "ownerId")]
        pub owner_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&DisableOwnerResponse> for DisableOwnerResponse {
        fn from(value: &DisableOwnerResponse) -> Self {
            value.clone()
        }
    }
    ///`EnableOwnerResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "isDisabled",
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "isDisabled": {
    ///      "type": "boolean"
    ///    },
    ///    "ownerId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct EnableOwnerResponse {
        #[serde(rename = "isDisabled")]
        pub is_disabled: bool,
        #[serde(rename = "ownerId")]
        pub owner_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&EnableOwnerResponse> for EnableOwnerResponse {
        fn from(value: &EnableOwnerResponse) -> Self {
            value.clone()
        }
    }
    ///`GetPanelActionResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "actionId",
    ///    "kind",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "actionId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "code": {
    ///      "type": "string"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/PanelActionKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/PanelActionStatus"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelActionResponse {
        #[serde(rename = "actionId")]
        pub action_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub code: ::std::option::Option<::std::string::String>,
        pub kind: ::codm_contracts_rust::wire::enums::PanelActionKind,
        pub status: ::codm_contracts_rust::wire::enums::PanelActionStatus,
    }
    impl ::std::convert::From<&GetPanelActionResponse> for GetPanelActionResponse {
        fn from(value: &GetPanelActionResponse) -> Self {
            value.clone()
        }
    }
    ///`GetPanelBoardResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "batches",
    ///    "group",
    ///    "issues"
    ///  ],
    ///  "properties": {
    ///    "batches": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/Batch"
    ///      }
    ///    },
    ///    "daemonLastSeenAt": {
    ///      "type": "string"
    ///    },
    ///    "group": {
    ///      "type": "object",
    ///      "required": [
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "name": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "health": {
    ///      "allOf": [
    ///        {
    ///          "$ref": "#/components/schemas/PanelHealth"
    ///        }
    ///      ]
    ///    },
    ///    "issues": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "issueId",
    ///          "key",
    ///          "lifeState",
    ///          "status",
    ///          "title",
    ///          "updatedAt"
    ///        ],
    ///        "properties": {
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "key": {
    ///            "type": "string"
    ///          },
    ///          "lifeState": {
    ///            "$ref": "#/components/schemas/IssueLifeState"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          },
    ///          "updatedAt": {
    ///            "type": "string"
    ///          },
    ///          "waitingForProviderUntil": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelBoardResponse {
        pub batches: ::std::vec::Vec<Batch>,
        #[serde(
            rename = "daemonLastSeenAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub daemon_last_seen_at: ::std::option::Option<::std::string::String>,
        pub group: GetPanelBoardResponseGroup,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub health: ::std::option::Option<PanelHealth>,
        pub issues: ::std::vec::Vec<GetPanelBoardResponseIssuesItem>,
    }
    impl ::std::convert::From<&GetPanelBoardResponse> for GetPanelBoardResponse {
        fn from(value: &GetPanelBoardResponse) -> Self {
            value.clone()
        }
    }
    ///`GetPanelBoardResponseGroup`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelBoardResponseGroup {
        pub name: ::std::string::String,
    }
    impl ::std::convert::From<&GetPanelBoardResponseGroup>
    for GetPanelBoardResponseGroup {
        fn from(value: &GetPanelBoardResponseGroup) -> Self {
            value.clone()
        }
    }
    ///`GetPanelBoardResponseIssuesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "key",
    ///    "lifeState",
    ///    "status",
    ///    "title",
    ///    "updatedAt"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "key": {
    ///      "type": "string"
    ///    },
    ///    "lifeState": {
    ///      "$ref": "#/components/schemas/IssueLifeState"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    },
    ///    "updatedAt": {
    ///      "type": "string"
    ///    },
    ///    "waitingForProviderUntil": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelBoardResponseIssuesItem {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(rename = "lifeState")]
        pub life_state: ::codm_contracts_rust::wire::enums::IssueLifeState,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
        #[serde(rename = "updatedAt")]
        pub updated_at: ::std::string::String,
        #[serde(
            rename = "waitingForProviderUntil",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub waiting_for_provider_until: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&GetPanelBoardResponseIssuesItem>
    for GetPanelBoardResponseIssuesItem {
        fn from(value: &GetPanelBoardResponseIssuesItem) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIdentityResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "member": {
    ///      "type": "object",
    ///      "required": [
    ///        "canRelease",
    ///        "memberId",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "canRelease": {
    ///          "type": "boolean"
    ///        },
    ///        "memberId": {
    ///          "type": "string",
    ///          "maxLength": 64,
    ///          "minLength": 16,
    ///          "pattern": "^[A-Za-z0-9_-]+$"
    ///        },
    ///        "name": {
    ///          "type": "string",
    ///          "maxLength": 120,
    ///          "minLength": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIdentityResponse {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub member: ::std::option::Option<GetPanelIdentityResponseMember>,
    }
    impl ::std::convert::From<&GetPanelIdentityResponse> for GetPanelIdentityResponse {
        fn from(value: &GetPanelIdentityResponse) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for GetPanelIdentityResponse {
        fn default() -> Self {
            Self { member: Default::default() }
        }
    }
    ///`GetPanelIdentityResponseMember`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "canRelease",
    ///    "memberId",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "canRelease": {
    ///      "type": "boolean"
    ///    },
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 16,
    ///      "pattern": "^[A-Za-z0-9_-]+$"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIdentityResponseMember {
        #[serde(rename = "canRelease")]
        pub can_release: bool,
        #[serde(rename = "memberId")]
        pub member_id: GetPanelIdentityResponseMemberMemberId,
        pub name: GetPanelIdentityResponseMemberName,
    }
    impl ::std::convert::From<&GetPanelIdentityResponseMember>
    for GetPanelIdentityResponseMember {
        fn from(value: &GetPanelIdentityResponseMember) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIdentityResponseMemberMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 16,
    ///  "pattern": "^[A-Za-z0-9_-]+$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct GetPanelIdentityResponseMemberMemberId(::std::string::String);
    impl ::std::ops::Deref for GetPanelIdentityResponseMemberMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<GetPanelIdentityResponseMemberMemberId>
    for ::std::string::String {
        fn from(value: GetPanelIdentityResponseMemberMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&GetPanelIdentityResponseMemberMemberId>
    for GetPanelIdentityResponseMemberMemberId {
        fn from(value: &GetPanelIdentityResponseMemberMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for GetPanelIdentityResponseMemberMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 16usize {
                return Err("shorter than 16 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^[A-Za-z0-9_-]+$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^[A-Za-z0-9_-]+$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for GetPanelIdentityResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for GetPanelIdentityResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for GetPanelIdentityResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for GetPanelIdentityResponseMemberMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`GetPanelIdentityResponseMemberName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct GetPanelIdentityResponseMemberName(::std::string::String);
    impl ::std::ops::Deref for GetPanelIdentityResponseMemberName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<GetPanelIdentityResponseMemberName>
    for ::std::string::String {
        fn from(value: GetPanelIdentityResponseMemberName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&GetPanelIdentityResponseMemberName>
    for GetPanelIdentityResponseMemberName {
        fn from(value: &GetPanelIdentityResponseMemberName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for GetPanelIdentityResponseMemberName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for GetPanelIdentityResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for GetPanelIdentityResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for GetPanelIdentityResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for GetPanelIdentityResponseMemberName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`GetPanelIssueResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issue",
    ///    "openStops",
    ///    "timeline"
    ///  ],
    ///  "properties": {
    ///    "issue": {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "key",
    ///        "lifeState",
    ///        "status",
    ///        "title",
    ///        "updatedAt"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "key": {
    ///          "type": "string"
    ///        },
    ///        "lifeState": {
    ///          "$ref": "#/components/schemas/IssueLifeState"
    ///        },
    ///        "status": {
    ///          "$ref": "#/components/schemas/IssueStatus"
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        },
    ///        "updatedAt": {
    ///          "type": "string"
    ///        },
    ///        "waitingForProviderUntil": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "openStops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "kind",
    ///          "resolutions",
    ///          "stopId"
    ///        ],
    ///        "properties": {
    ///          "ask": {
    ///            "oneOf": [
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "kind",
    ///                  "question",
    ///                  "releaseRequired",
    ///                  "reply"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "DECISION_REQUESTED"
    ///                    ]
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  },
    ///                  "releaseRequired": {
    ///                    "type": "boolean"
    ///                  },
    ///                  "reply": {
    ///                    "oneOf": [
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind",
    ///                          "options"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "OPTION"
    ///                            ]
    ///                          },
    ///                          "options": {
    ///                            "type": "array",
    ///                            "items": {
    ///                              "$ref": "#/components/schemas/AskOption"
    ///                            },
    ///                            "maxItems": 6,
    ///                            "minItems": 1
    ///                          }
    ///                        },
    ///                        "additionalProperties": false
    ///                      },
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "TEXT"
    ///                            ]
    ///                          }
    ///                        },
    ///                        "additionalProperties": false
    ///                      }
    ///                    ]
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "defaultLabel",
    ///                  "kind",
    ///                  "question",
    ///                  "reply"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "defaultLabel": {
    ///                    "type": "string"
    ///                  },
    ///                  "dueAt": {
    ///                    "type": "string"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "QUESTION_ASKED"
    ///                    ]
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  },
    ///                  "reply": {
    ///                    "oneOf": [
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind",
    ///                          "options"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "OPTION"
    ///                            ]
    ///                          },
    ///                          "options": {
    ///                            "type": "array",
    ///                            "items": {
    ///                              "$ref": "#/components/schemas/AskOption"
    ///                            },
    ///                            "maxItems": 6,
    ///                            "minItems": 1
    ///                          }
    ///                        },
    ///                        "additionalProperties": false
    ///                      },
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "TEXT"
    ///                            ]
    ///                          }
    ///                        },
    ///                        "additionalProperties": false
    ///                      }
    ///                    ]
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              }
    ///            ]
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          },
    ///          "resolutions": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/StopResolution"
    ///            },
    ///            "maxItems": 8
    ///          },
    ///          "stopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "timeline": {
    ///      "type": "array",
    ///      "items": {
    ///        "oneOf": [
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "title"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "CREATED"
    ///                ]
    ///              },
    ///              "title": {
    ///                "type": "string"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "TURN_STARTED"
    ///                ]
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "entryId",
    ///              "id",
    ///              "kind",
    ///              "text",
    ///              "transcriptKind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "classification": {
    ///                "$ref": "#/components/schemas/ClassificationMethod"
    ///              },
    ///              "entryId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "MESSAGE"
    ///                ]
    ///              },
    ///              "level": {
    ///                "$ref": "#/components/schemas/IssueSignalLevel"
    ///              },
    ///              "routing": {
    ///                "$ref": "#/components/schemas/OutputRouting"
    ///              },
    ///              "text": {
    ///                "type": "string"
    ///              },
    ///              "transcriptKind": {
    ///                "$ref": "#/components/schemas/TranscriptKind"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "reminder",
    ///              "text"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "deliveredAt": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STEER"
    ///                ]
    ///              },
    ///              "readAt": {
    ///                "type": "string"
    ///              },
    ///              "reminder": {
    ///                "type": "boolean"
    ///              },
    ///              "text": {
    ///                "type": "string"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "artifactId",
    ///              "artifactKind",
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "name"
    ///            ],
    ///            "properties": {
    ///              "artifactId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "artifactKind": {
    ///                "$ref": "#/components/schemas/ArtifactKind"
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "ARTIFACT"
    ///                ]
    ///              },
    ///              "name": {
    ///                "type": "string"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "stopId",
    ///              "stopKind",
    ///              "title"
    ///            ],
    ///            "properties": {
    ///              "ask": {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "options",
    ///                  "question"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "dueAt": {
    ///                    "type": "string"
    ///                  },
    ///                  "options": {
    ///                    "type": "array",
    ///                    "items": {
    ///                      "$ref": "#/components/schemas/AskOption"
    ///                    }
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STOP_RAISED"
    ///                ]
    ///              },
    ///              "stopId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "stopKind": {
    ///                "$ref": "#/components/schemas/StopKind"
    ///              },
    ///              "title": {
    ///                "type": "string"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "resolution",
    ///              "stopId"
    ///            ],
    ///            "properties": {
    ///              "answer": {
    ///                "type": "object",
    ///                "required": [
    ///                  "kind",
    ///                  "label"
    ///                ],
    ///                "properties": {
    ///                  "kind": {
    ///                    "$ref": "#/components/schemas/AskAnswerKind"
    ///                  },
    ///                  "label": {
    ///                    "type": "string"
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STOP_RESOLVED"
    ///                ]
    ///              },
    ///              "resolution": {
    ///                "$ref": "#/components/schemas/StopResolution"
    ///              },
    ///              "stopId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "COMPLETED"
    ///                ]
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "ARCHIVED"
    ///                ]
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "source"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "by": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "PAUSED"
    ///                ]
    ///              },
    ///              "source": {
    ///                "$ref": "#/components/schemas/IssueControlSource"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "source"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "by": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "RESUMED"
    ///                ]
    ///              },
    ///              "source": {
    ///                "$ref": "#/components/schemas/IssueControlSource"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "actionKind",
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "outcome",
    ///              "waitedMs"
    ///            ],
    ///            "properties": {
    ///              "actionKind": {
    ///                "$ref": "#/components/schemas/IrreversibleActionKind"
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "REGRET_WINDOW"
    ///                ]
    ///              },
    ///              "outcome": {
    ///                "$ref": "#/components/schemas/RegretWindowOutcome"
    ///              },
    ///              "waitedMs": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 0.0
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "batchCode",
    ///              "id",
    ///              "kind",
    ///              "n"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "batchCode": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "BATCH_LINKED"
    ///                ]
    ///              },
    ///              "n": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 1.0
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "durationMs",
    ///              "id",
    ///              "kind",
    ///              "outcome"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "durationMs": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 0.0
    ///              },
    ///              "exitCode": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": -9007199254740991.0
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "PUBLISH_RAN"
    ///                ]
    ///              },
    ///              "outcome": {
    ///                "$ref": "#/components/schemas/PublishRunOutcome"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          }
    ///        ]
    ///      }
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIssueResponse {
        pub issue: GetPanelIssueResponseIssue,
        #[serde(rename = "openStops")]
        pub open_stops: ::std::vec::Vec<GetPanelIssueResponseOpenStopsItem>,
        pub timeline: ::std::vec::Vec<GetPanelIssueResponseTimelineItem>,
    }
    impl ::std::convert::From<&GetPanelIssueResponse> for GetPanelIssueResponse {
        fn from(value: &GetPanelIssueResponse) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseIssue`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "key",
    ///    "lifeState",
    ///    "status",
    ///    "title",
    ///    "updatedAt"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "key": {
    ///      "type": "string"
    ///    },
    ///    "lifeState": {
    ///      "$ref": "#/components/schemas/IssueLifeState"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    },
    ///    "updatedAt": {
    ///      "type": "string"
    ///    },
    ///    "waitingForProviderUntil": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIssueResponseIssue {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(rename = "lifeState")]
        pub life_state: ::codm_contracts_rust::wire::enums::IssueLifeState,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
        #[serde(rename = "updatedAt")]
        pub updated_at: ::std::string::String,
        #[serde(
            rename = "waitingForProviderUntil",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub waiting_for_provider_until: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&GetPanelIssueResponseIssue>
    for GetPanelIssueResponseIssue {
        fn from(value: &GetPanelIssueResponseIssue) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseOpenStopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "kind",
    ///    "resolutions",
    ///    "stopId"
    ///  ],
    ///  "properties": {
    ///    "ask": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "kind",
    ///            "question",
    ///            "releaseRequired",
    ///            "reply"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "DECISION_REQUESTED"
    ///              ]
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            },
    ///            "releaseRequired": {
    ///              "type": "boolean"
    ///            },
    ///            "reply": {
    ///              "oneOf": [
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind",
    ///                    "options"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "OPTION"
    ///                      ]
    ///                    },
    ///                    "options": {
    ///                      "type": "array",
    ///                      "items": {
    ///                        "$ref": "#/components/schemas/AskOption"
    ///                      },
    ///                      "maxItems": 6,
    ///                      "minItems": 1
    ///                    }
    ///                  },
    ///                  "additionalProperties": false
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "TEXT"
    ///                      ]
    ///                    }
    ///                  },
    ///                  "additionalProperties": false
    ///                }
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "defaultLabel",
    ///            "kind",
    ///            "question",
    ///            "reply"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "defaultLabel": {
    ///              "type": "string"
    ///            },
    ///            "dueAt": {
    ///              "type": "string"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "QUESTION_ASKED"
    ///              ]
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            },
    ///            "reply": {
    ///              "oneOf": [
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind",
    ///                    "options"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "OPTION"
    ///                      ]
    ///                    },
    ///                    "options": {
    ///                      "type": "array",
    ///                      "items": {
    ///                        "$ref": "#/components/schemas/AskOption"
    ///                      },
    ///                      "maxItems": 6,
    ///                      "minItems": 1
    ///                    }
    ///                  },
    ///                  "additionalProperties": false
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "TEXT"
    ///                      ]
    ///                    }
    ///                  },
    ///                  "additionalProperties": false
    ///                }
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      ]
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    },
    ///    "resolutions": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/StopResolution"
    ///      },
    ///      "maxItems": 8
    ///    },
    ///    "stopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIssueResponseOpenStopsItem {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub ask: ::std::option::Option<GetPanelIssueResponseOpenStopsItemAsk>,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
        pub resolutions: ::std::vec::Vec<
            ::codm_contracts_rust::wire::enums::StopResolution,
        >,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetPanelIssueResponseOpenStopsItem>
    for GetPanelIssueResponseOpenStopsItem {
        fn from(value: &GetPanelIssueResponseOpenStopsItem) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseOpenStopsItemAsk`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "code",
    ///        "kind",
    ///        "question",
    ///        "releaseRequired",
    ///        "reply"
    ///      ],
    ///      "properties": {
    ///        "code": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DECISION_REQUESTED"
    ///          ]
    ///        },
    ///        "question": {
    ///          "type": "string"
    ///        },
    ///        "releaseRequired": {
    ///          "type": "boolean"
    ///        },
    ///        "reply": {
    ///          "oneOf": [
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind",
    ///                "options"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "OPTION"
    ///                  ]
    ///                },
    ///                "options": {
    ///                  "type": "array",
    ///                  "items": {
    ///                    "$ref": "#/components/schemas/AskOption"
    ///                  },
    ///                  "maxItems": 6,
    ///                  "minItems": 1
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            },
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "TEXT"
    ///                  ]
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            }
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "code",
    ///        "defaultLabel",
    ///        "kind",
    ///        "question",
    ///        "reply"
    ///      ],
    ///      "properties": {
    ///        "code": {
    ///          "type": "string"
    ///        },
    ///        "defaultLabel": {
    ///          "type": "string"
    ///        },
    ///        "dueAt": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "QUESTION_ASKED"
    ///          ]
    ///        },
    ///        "question": {
    ///          "type": "string"
    ///        },
    ///        "reply": {
    ///          "oneOf": [
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind",
    ///                "options"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "OPTION"
    ///                  ]
    ///                },
    ///                "options": {
    ///                  "type": "array",
    ///                  "items": {
    ///                    "$ref": "#/components/schemas/AskOption"
    ///                  },
    ///                  "maxItems": 6,
    ///                  "minItems": 1
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            },
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "TEXT"
    ///                  ]
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            }
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", deny_unknown_fields)]
    pub enum GetPanelIssueResponseOpenStopsItemAsk {
        #[serde(rename = "DECISION_REQUESTED")]
        DecisionRequested {
            code: ::std::string::String,
            question: ::std::string::String,
            #[serde(rename = "releaseRequired")]
            release_required: bool,
            reply: GetPanelIssueResponseOpenStopsItemAskReply,
        },
        #[serde(rename = "QUESTION_ASKED")]
        QuestionAsked {
            code: ::std::string::String,
            #[serde(rename = "defaultLabel")]
            default_label: ::std::string::String,
            #[serde(
                rename = "dueAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            due_at: ::std::option::Option<::std::string::String>,
            question: ::std::string::String,
            reply: GetPanelIssueResponseOpenStopsItemAskReply,
        },
    }
    impl ::std::convert::From<&Self> for GetPanelIssueResponseOpenStopsItemAsk {
        fn from(value: &GetPanelIssueResponseOpenStopsItemAsk) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseOpenStopsItemAskReply`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "options"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "OPTION"
    ///          ]
    ///        },
    ///        "options": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/AskOption"
    ///          },
    ///          "maxItems": 6,
    ///          "minItems": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "TEXT"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", content = "options")]
    pub enum GetPanelIssueResponseOpenStopsItemAskReply {
        #[serde(rename = "OPTION")]
        Option(::std::vec::Vec<AskOption>),
        #[serde(rename = "TEXT")]
        Text,
    }
    impl ::std::convert::From<&Self> for GetPanelIssueResponseOpenStopsItemAskReply {
        fn from(value: &GetPanelIssueResponseOpenStopsItemAskReply) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<::std::vec::Vec<AskOption>>
    for GetPanelIssueResponseOpenStopsItemAskReply {
        fn from(value: ::std::vec::Vec<AskOption>) -> Self {
            Self::Option(value)
        }
    }
    ///`GetPanelIssueResponseTimelineItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "title"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "CREATED"
    ///          ]
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "TURN_STARTED"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "entryId",
    ///        "id",
    ///        "kind",
    ///        "text",
    ///        "transcriptKind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "classification": {
    ///          "$ref": "#/components/schemas/ClassificationMethod"
    ///        },
    ///        "entryId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "MESSAGE"
    ///          ]
    ///        },
    ///        "level": {
    ///          "$ref": "#/components/schemas/IssueSignalLevel"
    ///        },
    ///        "routing": {
    ///          "$ref": "#/components/schemas/OutputRouting"
    ///        },
    ///        "text": {
    ///          "type": "string"
    ///        },
    ///        "transcriptKind": {
    ///          "$ref": "#/components/schemas/TranscriptKind"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "reminder",
    ///        "text"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "deliveredAt": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STEER"
    ///          ]
    ///        },
    ///        "readAt": {
    ///          "type": "string"
    ///        },
    ///        "reminder": {
    ///          "type": "boolean"
    ///        },
    ///        "text": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "artifactId",
    ///        "artifactKind",
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "artifactId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "artifactKind": {
    ///          "$ref": "#/components/schemas/ArtifactKind"
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ARTIFACT"
    ///          ]
    ///        },
    ///        "name": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "stopId",
    ///        "stopKind",
    ///        "title"
    ///      ],
    ///      "properties": {
    ///        "ask": {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "options",
    ///            "question"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "dueAt": {
    ///              "type": "string"
    ///            },
    ///            "options": {
    ///              "type": "array",
    ///              "items": {
    ///                "$ref": "#/components/schemas/AskOption"
    ///              }
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STOP_RAISED"
    ///          ]
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "stopKind": {
    ///          "$ref": "#/components/schemas/StopKind"
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "resolution",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "answer": {
    ///          "type": "object",
    ///          "required": [
    ///            "kind",
    ///            "label"
    ///          ],
    ///          "properties": {
    ///            "kind": {
    ///              "$ref": "#/components/schemas/AskAnswerKind"
    ///            },
    ///            "label": {
    ///              "type": "string"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STOP_RESOLVED"
    ///          ]
    ///        },
    ///        "resolution": {
    ///          "$ref": "#/components/schemas/StopResolution"
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "COMPLETED"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ARCHIVED"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "source"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "by": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PAUSED"
    ///          ]
    ///        },
    ///        "source": {
    ///          "$ref": "#/components/schemas/IssueControlSource"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "source"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "by": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "RESUMED"
    ///          ]
    ///        },
    ///        "source": {
    ///          "$ref": "#/components/schemas/IssueControlSource"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "actionKind",
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "outcome",
    ///        "waitedMs"
    ///      ],
    ///      "properties": {
    ///        "actionKind": {
    ///          "$ref": "#/components/schemas/IrreversibleActionKind"
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "REGRET_WINDOW"
    ///          ]
    ///        },
    ///        "outcome": {
    ///          "$ref": "#/components/schemas/RegretWindowOutcome"
    ///        },
    ///        "waitedMs": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "batchCode",
    ///        "id",
    ///        "kind",
    ///        "n"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "batchCode": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "BATCH_LINKED"
    ///          ]
    ///        },
    ///        "n": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 1.0
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "durationMs",
    ///        "id",
    ///        "kind",
    ///        "outcome"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "durationMs": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        },
    ///        "exitCode": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PUBLISH_RAN"
    ///          ]
    ///        },
    ///        "outcome": {
    ///          "$ref": "#/components/schemas/PublishRunOutcome"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", deny_unknown_fields)]
    pub enum GetPanelIssueResponseTimelineItem {
        #[serde(rename = "CREATED")]
        Created {
            at: ::std::string::String,
            id: ::std::string::String,
            title: ::std::string::String,
        },
        #[serde(rename = "TURN_STARTED")]
        TurnStarted { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "MESSAGE")]
        Message {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            classification: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::ClassificationMethod,
            >,
            #[serde(rename = "entryId")]
            entry_id: ::uuid::Uuid,
            id: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            level: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::IssueSignalLevel,
            >,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            routing: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::OutputRouting,
            >,
            text: ::std::string::String,
            #[serde(rename = "transcriptKind")]
            transcript_kind: ::codm_contracts_rust::wire::enums::TranscriptKind,
        },
        #[serde(rename = "STEER")]
        Steer {
            at: ::std::string::String,
            #[serde(
                rename = "deliveredAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            delivered_at: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            #[serde(
                rename = "readAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            read_at: ::std::option::Option<::std::string::String>,
            reminder: bool,
            text: ::std::string::String,
        },
        #[serde(rename = "ARTIFACT")]
        Artifact {
            #[serde(rename = "artifactId")]
            artifact_id: ::uuid::Uuid,
            #[serde(rename = "artifactKind")]
            artifact_kind: ::codm_contracts_rust::wire::enums::ArtifactKind,
            at: ::std::string::String,
            id: ::std::string::String,
            name: ::std::string::String,
        },
        #[serde(rename = "STOP_RAISED")]
        StopRaised {
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            ask: ::std::option::Option<GetPanelIssueResponseTimelineItemAsk>,
            at: ::std::string::String,
            id: ::std::string::String,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
            #[serde(rename = "stopKind")]
            stop_kind: ::codm_contracts_rust::wire::enums::StopKind,
            title: ::std::string::String,
        },
        #[serde(rename = "STOP_RESOLVED")]
        StopResolved {
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            answer: ::std::option::Option<GetPanelIssueResponseTimelineItemAnswer>,
            at: ::std::string::String,
            id: ::std::string::String,
            resolution: ::codm_contracts_rust::wire::enums::StopResolution,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
        #[serde(rename = "COMPLETED")]
        Completed { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "ARCHIVED")]
        Archived { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "PAUSED")]
        Paused {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            by: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            source: ::codm_contracts_rust::wire::enums::IssueControlSource,
        },
        #[serde(rename = "RESUMED")]
        Resumed {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            by: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            source: ::codm_contracts_rust::wire::enums::IssueControlSource,
        },
        #[serde(rename = "REGRET_WINDOW")]
        RegretWindow {
            #[serde(rename = "actionKind")]
            action_kind: ::codm_contracts_rust::wire::enums::IrreversibleActionKind,
            at: ::std::string::String,
            id: ::std::string::String,
            outcome: ::codm_contracts_rust::wire::enums::RegretWindowOutcome,
            #[serde(rename = "waitedMs")]
            waited_ms: i64,
        },
        #[serde(rename = "BATCH_LINKED")]
        BatchLinked {
            at: ::std::string::String,
            #[serde(rename = "batchCode")]
            batch_code: ::std::string::String,
            id: ::std::string::String,
            n: ::std::num::NonZeroU64,
        },
        #[serde(rename = "PUBLISH_RAN")]
        PublishRan {
            at: ::std::string::String,
            #[serde(rename = "durationMs")]
            duration_ms: i64,
            #[serde(
                rename = "exitCode",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            exit_code: ::std::option::Option<i64>,
            id: ::std::string::String,
            outcome: ::codm_contracts_rust::wire::enums::PublishRunOutcome,
        },
    }
    impl ::std::convert::From<&Self> for GetPanelIssueResponseTimelineItem {
        fn from(value: &GetPanelIssueResponseTimelineItem) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseTimelineItemAnswer`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "kind",
    ///    "label"
    ///  ],
    ///  "properties": {
    ///    "kind": {
    ///      "$ref": "#/components/schemas/AskAnswerKind"
    ///    },
    ///    "label": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIssueResponseTimelineItemAnswer {
        pub kind: ::codm_contracts_rust::wire::enums::AskAnswerKind,
        pub label: ::std::string::String,
    }
    impl ::std::convert::From<&GetPanelIssueResponseTimelineItemAnswer>
    for GetPanelIssueResponseTimelineItemAnswer {
        fn from(value: &GetPanelIssueResponseTimelineItemAnswer) -> Self {
            value.clone()
        }
    }
    ///`GetPanelIssueResponseTimelineItemAsk`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "options",
    ///    "question"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string"
    ///    },
    ///    "dueAt": {
    ///      "type": "string"
    ///    },
    ///    "options": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/AskOption"
    ///      }
    ///    },
    ///    "question": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetPanelIssueResponseTimelineItemAsk {
        pub code: ::std::string::String,
        #[serde(
            rename = "dueAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub due_at: ::std::option::Option<::std::string::String>,
        pub options: ::std::vec::Vec<AskOption>,
        pub question: ::std::string::String,
    }
    impl ::std::convert::From<&GetPanelIssueResponseTimelineItemAsk>
    for GetPanelIssueResponseTimelineItemAsk {
        fn from(value: &GetPanelIssueResponseTimelineItemAsk) -> Self {
            value.clone()
        }
    }
    ///`GetSessionResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "session",
    ///    "user"
    ///  ],
    ///  "properties": {
    ///    "session": {
    ///      "type": "object",
    ///      "required": [
    ///        "expiresAt",
    ///        "id",
    ///        "ownerId",
    ///        "userId"
    ///      ],
    ///      "properties": {
    ///        "expiresAt": {
    ///          "type": "string",
    ///          "format": "date-time"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "ownerId": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ]
    ///        },
    ///        "userId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "user": {
    ///      "type": "object",
    ///      "required": [
    ///        "email",
    ///        "emailVerified",
    ///        "id",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "email": {
    ///          "type": "string"
    ///        },
    ///        "emailVerified": {
    ///          "type": "boolean"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "language": {
    ///          "$ref": "#/components/schemas/Language"
    ///        },
    ///        "name": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionResponse {
        pub session: GetSessionResponseSession,
        pub user: GetSessionResponseUser,
    }
    impl ::std::convert::From<&GetSessionResponse> for GetSessionResponse {
        fn from(value: &GetSessionResponse) -> Self {
            value.clone()
        }
    }
    ///`GetSessionResponseSession`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "expiresAt",
    ///    "id",
    ///    "ownerId",
    ///    "userId"
    ///  ],
    ///  "properties": {
    ///    "expiresAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "userId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionResponseSession {
        #[serde(rename = "expiresAt")]
        pub expires_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub id: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::option::Option<::std::string::String>,
        #[serde(rename = "userId")]
        pub user_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetSessionResponseSession> for GetSessionResponseSession {
        fn from(value: &GetSessionResponseSession) -> Self {
            value.clone()
        }
    }
    ///`GetSessionResponseUser`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "email",
    ///    "emailVerified",
    ///    "id",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "email": {
    ///      "type": "string"
    ///    },
    ///    "emailVerified": {
    ///      "type": "boolean"
    ///    },
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "language": {
    ///      "$ref": "#/components/schemas/Language"
    ///    },
    ///    "name": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionResponseUser {
        pub email: ::std::string::String,
        #[serde(rename = "emailVerified")]
        pub email_verified: bool,
        pub id: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub language: ::std::option::Option<
            ::codm_contracts_rust::wire::enums::Language,
        >,
        pub name: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&GetSessionResponseUser> for GetSessionResponseUser {
        fn from(value: &GetSessionResponseUser) -> Self {
            value.clone()
        }
    }
    ///`HealthResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "components",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "components": {
    ///      "type": "object",
    ///      "additionalProperties": {
    ///        "type": "object",
    ///        "required": [
    ///          "gate",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "detail": {
    ///            "type": "string"
    ///          },
    ///          "gate": {
    ///            "type": "boolean"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/Status2"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/Status"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct HealthResponse {
        pub components: ::std::collections::HashMap<
            ::std::string::String,
            HealthResponseComponentsValue,
        >,
        pub status: Status,
    }
    impl ::std::convert::From<&HealthResponse> for HealthResponse {
        fn from(value: &HealthResponse) -> Self {
            value.clone()
        }
    }
    ///`HealthResponseComponentsValue`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "gate",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "detail": {
    ///      "type": "string"
    ///    },
    ///    "gate": {
    ///      "type": "boolean"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/Status2"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct HealthResponseComponentsValue {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub detail: ::std::option::Option<::std::string::String>,
        pub gate: bool,
        pub status: Status2,
    }
    impl ::std::convert::From<&HealthResponseComponentsValue>
    for HealthResponseComponentsValue {
        fn from(value: &HealthResponseComponentsValue) -> Self {
            value.clone()
        }
    }
    ///`ListPanelMembersResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "members"
    ///  ],
    ///  "properties": {
    ///    "members": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "memberId",
    ///          "name"
    ///        ],
    ///        "properties": {
    ///          "memberId": {
    ///            "type": "string",
    ///            "maxLength": 64,
    ///            "minLength": 16,
    ///            "pattern": "^[A-Za-z0-9_-]+$"
    ///          },
    ///          "name": {
    ///            "type": "string",
    ///            "maxLength": 120,
    ///            "minLength": 1
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ListPanelMembersResponse {
        pub members: ::std::vec::Vec<ListPanelMembersResponseMembersItem>,
    }
    impl ::std::convert::From<&ListPanelMembersResponse> for ListPanelMembersResponse {
        fn from(value: &ListPanelMembersResponse) -> Self {
            value.clone()
        }
    }
    ///`ListPanelMembersResponseMembersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "memberId",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 16,
    ///      "pattern": "^[A-Za-z0-9_-]+$"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ListPanelMembersResponseMembersItem {
        #[serde(rename = "memberId")]
        pub member_id: ListPanelMembersResponseMembersItemMemberId,
        pub name: ListPanelMembersResponseMembersItemName,
    }
    impl ::std::convert::From<&ListPanelMembersResponseMembersItem>
    for ListPanelMembersResponseMembersItem {
        fn from(value: &ListPanelMembersResponseMembersItem) -> Self {
            value.clone()
        }
    }
    ///`ListPanelMembersResponseMembersItemMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 16,
    ///  "pattern": "^[A-Za-z0-9_-]+$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct ListPanelMembersResponseMembersItemMemberId(::std::string::String);
    impl ::std::ops::Deref for ListPanelMembersResponseMembersItemMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ListPanelMembersResponseMembersItemMemberId>
    for ::std::string::String {
        fn from(value: ListPanelMembersResponseMembersItemMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ListPanelMembersResponseMembersItemMemberId>
    for ListPanelMembersResponseMembersItemMemberId {
        fn from(value: &ListPanelMembersResponseMembersItemMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ListPanelMembersResponseMembersItemMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 16usize {
                return Err("shorter than 16 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^[A-Za-z0-9_-]+$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^[A-Za-z0-9_-]+$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for ListPanelMembersResponseMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for ListPanelMembersResponseMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for ListPanelMembersResponseMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for ListPanelMembersResponseMembersItemMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`ListPanelMembersResponseMembersItemName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct ListPanelMembersResponseMembersItemName(::std::string::String);
    impl ::std::ops::Deref for ListPanelMembersResponseMembersItemName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ListPanelMembersResponseMembersItemName>
    for ::std::string::String {
        fn from(value: ListPanelMembersResponseMembersItemName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ListPanelMembersResponseMembersItemName>
    for ListPanelMembersResponseMembersItemName {
        fn from(value: &ListPanelMembersResponseMembersItemName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ListPanelMembersResponseMembersItemName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for ListPanelMembersResponseMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for ListPanelMembersResponseMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for ListPanelMembersResponseMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for ListPanelMembersResponseMembersItemName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`PanelHealth`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "daemonSeenAt",
    ///    "queuePending",
    ///    "slots",
    ///    "state",
    ///    "weekPercent",
    ///    "windowPercent"
    ///  ],
    ///  "properties": {
    ///    "daemonSeenAt": {
    ///      "type": "string",
    ///      "format": "date-time",
    ///      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///    },
    ///    "queuePending": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": 0.0
    ///    },
    ///    "slots": {
    ///      "type": "object",
    ///      "required": [
    ///        "effective",
    ///        "inUse"
    ///      ],
    ///      "properties": {
    ///        "effective": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        },
    ///        "inUse": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        }
    ///      }
    ///    },
    ///    "state": {
    ///      "$ref": "#/components/schemas/QuotaState"
    ///    },
    ///    "weekPercent": {
    ///      "type": "number",
    ///      "maximum": 100.0,
    ///      "minimum": 0.0
    ///    },
    ///    "windowPercent": {
    ///      "type": "number",
    ///      "maximum": 100.0,
    ///      "minimum": 0.0
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct PanelHealth {
        #[serde(rename = "daemonSeenAt")]
        pub daemon_seen_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "queuePending")]
        pub queue_pending: i64,
        pub slots: PanelHealthSlots,
        pub state: ::codm_contracts_rust::wire::enums::QuotaState,
        #[serde(rename = "weekPercent")]
        pub week_percent: f64,
        #[serde(rename = "windowPercent")]
        pub window_percent: f64,
    }
    impl ::std::convert::From<&PanelHealth> for PanelHealth {
        fn from(value: &PanelHealth) -> Self {
            value.clone()
        }
    }
    ///`PanelHealthSlots`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "effective",
    ///    "inUse"
    ///  ],
    ///  "properties": {
    ///    "effective": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": 0.0
    ///    },
    ///    "inUse": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": 0.0
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct PanelHealthSlots {
        pub effective: i64,
        #[serde(rename = "inUse")]
        pub in_use: i64,
    }
    impl ::std::convert::From<&PanelHealthSlots> for PanelHealthSlots {
        fn from(value: &PanelHealthSlots) -> Self {
            value.clone()
        }
    }
    ///`RequestPanelActionBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PAUSE"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "RESUME"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind",
    ///        "text"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STEER"
    ///          ]
    ///        },
    ///        "text": {
    ///          "type": "string",
    ///          "maxLength": 2000,
    ///          "minLength": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind",
    ///        "resolution",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ANSWER_STOP"
    ///          ]
    ///        },
    ///        "resolution": {
    ///          "$ref": "#/components/schemas/StopResolution"
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "answer",
    ///        "issueId",
    ///        "kind",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "answer": {
    ///          "$ref": "#/components/schemas/AskAnswer"
    ///        },
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ANSWER_ASK"
    ///          ]
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind")]
    pub enum RequestPanelActionBody {
        #[serde(rename = "PAUSE")]
        Pause { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "RESUME")]
        Resume { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "STEER")]
        Steer {
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            text: RequestPanelActionBodyText,
        },
        #[serde(rename = "ANSWER_STOP")]
        AnswerStop {
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            resolution: ::codm_contracts_rust::wire::enums::StopResolution,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
        #[serde(rename = "ANSWER_ASK")]
        AnswerAsk {
            answer: AskAnswer,
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
    }
    impl ::std::convert::From<&Self> for RequestPanelActionBody {
        fn from(value: &RequestPanelActionBody) -> Self {
            value.clone()
        }
    }
    ///`RequestPanelActionBodyText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 2000,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct RequestPanelActionBodyText(::std::string::String);
    impl ::std::ops::Deref for RequestPanelActionBodyText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<RequestPanelActionBodyText> for ::std::string::String {
        fn from(value: RequestPanelActionBodyText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&RequestPanelActionBodyText>
    for RequestPanelActionBodyText {
        fn from(value: &RequestPanelActionBodyText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for RequestPanelActionBodyText {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 2000usize {
                return Err("longer than 2000 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for RequestPanelActionBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for RequestPanelActionBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for RequestPanelActionBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for RequestPanelActionBodyText {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`RequestPanelActionResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "actionId",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "actionId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "status": {
    ///      "type": "string",
    ///      "enum": [
    ///        "PENDING"
    ///      ]
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct RequestPanelActionResponse {
        #[serde(rename = "actionId")]
        pub action_id: ::uuid::Uuid,
        pub status: RequestPanelActionResponseStatus,
    }
    impl ::std::convert::From<&RequestPanelActionResponse>
    for RequestPanelActionResponse {
        fn from(value: &RequestPanelActionResponse) -> Self {
            value.clone()
        }
    }
    ///`RequestPanelActionResponseStatus`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "PENDING"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(
        ::serde::Deserialize,
        ::serde::Serialize,
        Clone,
        Copy,
        Debug,
        Eq,
        Hash,
        Ord,
        PartialEq,
        PartialOrd
    )]
    pub enum RequestPanelActionResponseStatus {
        #[serde(rename = "PENDING")]
        Pending,
    }
    impl ::std::convert::From<&Self> for RequestPanelActionResponseStatus {
        fn from(value: &RequestPanelActionResponseStatus) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for RequestPanelActionResponseStatus {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Pending => f.write_str("PENDING"),
            }
        }
    }
    impl ::std::str::FromStr for RequestPanelActionResponseStatus {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "PENDING" => Ok(Self::Pending),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for RequestPanelActionResponseStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for RequestPanelActionResponseStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for RequestPanelActionResponseStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`RequestPanelCodeBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "memberId"
    ///  ],
    ///  "properties": {
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct RequestPanelCodeBody {
        #[serde(rename = "memberId")]
        pub member_id: RequestPanelCodeBodyMemberId,
    }
    impl ::std::convert::From<&RequestPanelCodeBody> for RequestPanelCodeBody {
        fn from(value: &RequestPanelCodeBody) -> Self {
            value.clone()
        }
    }
    ///`RequestPanelCodeBodyMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct RequestPanelCodeBodyMemberId(::std::string::String);
    impl ::std::ops::Deref for RequestPanelCodeBodyMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<RequestPanelCodeBodyMemberId> for ::std::string::String {
        fn from(value: RequestPanelCodeBodyMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&RequestPanelCodeBodyMemberId>
    for RequestPanelCodeBodyMemberId {
        fn from(value: &RequestPanelCodeBodyMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for RequestPanelCodeBodyMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for RequestPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for RequestPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for RequestPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for RequestPanelCodeBodyMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`RotatePanelLinkResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "token"
    ///  ],
    ///  "properties": {
    ///    "token": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct RotatePanelLinkResponse {
        pub token: ::std::string::String,
    }
    impl ::std::convert::From<&RotatePanelLinkResponse> for RotatePanelLinkResponse {
        fn from(value: &RotatePanelLinkResponse) -> Self {
            value.clone()
        }
    }
    ///`SetActiveOwnerResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "ownerId": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SetActiveOwnerResponse {
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
    }
    impl ::std::convert::From<&SetActiveOwnerResponse> for SetActiveOwnerResponse {
        fn from(value: &SetActiveOwnerResponse) -> Self {
            value.clone()
        }
    }
    ///`SetCloudTokenBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "token"
    ///  ],
    ///  "properties": {
    ///    "token": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SetCloudTokenBody {
        pub token: SetCloudTokenBodyToken,
    }
    impl ::std::convert::From<&SetCloudTokenBody> for SetCloudTokenBody {
        fn from(value: &SetCloudTokenBody) -> Self {
            value.clone()
        }
    }
    ///`SetCloudTokenBodyToken`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SetCloudTokenBodyToken(::std::string::String);
    impl ::std::ops::Deref for SetCloudTokenBodyToken {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SetCloudTokenBodyToken> for ::std::string::String {
        fn from(value: SetCloudTokenBodyToken) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SetCloudTokenBodyToken> for SetCloudTokenBodyToken {
        fn from(value: &SetCloudTokenBodyToken) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SetCloudTokenBodyToken {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SetCloudTokenBodyToken {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SetCloudTokenBodyToken {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SetCloudTokenBodyToken {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SetCloudTokenBodyToken {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SignInLoopbackCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SignInLoopbackCode(::std::string::String);
    impl ::std::ops::Deref for SignInLoopbackCode {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SignInLoopbackCode> for ::std::string::String {
        fn from(value: SignInLoopbackCode) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SignInLoopbackCode> for SignInLoopbackCode {
        fn from(value: &SignInLoopbackCode) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SignInLoopbackCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SignInLoopbackCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SignInLoopbackCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SignInLoopbackCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SignInLoopbackCode {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SocialProvider`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "github",
    ///    "google"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(
        ::serde::Deserialize,
        ::serde::Serialize,
        Clone,
        Copy,
        Debug,
        Eq,
        Hash,
        Ord,
        PartialEq,
        PartialOrd
    )]
    pub enum SocialProvider {
        #[serde(rename = "github")]
        Github,
        #[serde(rename = "google")]
        Google,
    }
    impl ::std::convert::From<&Self> for SocialProvider {
        fn from(value: &SocialProvider) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for SocialProvider {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Github => f.write_str("github"),
                Self::Google => f.write_str("google"),
            }
        }
    }
    impl ::std::str::FromStr for SocialProvider {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "github" => Ok(Self::Github),
                "google" => Ok(Self::Google),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for SocialProvider {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SocialProvider {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SocialProvider {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`Status`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "ok",
    ///    "not_ready"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(
        ::serde::Deserialize,
        ::serde::Serialize,
        Clone,
        Copy,
        Debug,
        Eq,
        Hash,
        Ord,
        PartialEq,
        PartialOrd
    )]
    pub enum Status {
        #[serde(rename = "ok")]
        Ok,
        #[serde(rename = "not_ready")]
        NotReady,
    }
    impl ::std::convert::From<&Self> for Status {
        fn from(value: &Status) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for Status {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Ok => f.write_str("ok"),
                Self::NotReady => f.write_str("not_ready"),
            }
        }
    }
    impl ::std::str::FromStr for Status {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "ok" => Ok(Self::Ok),
                "not_ready" => Ok(Self::NotReady),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for Status {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for Status {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for Status {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`Status2`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "up",
    ///    "down"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(
        ::serde::Deserialize,
        ::serde::Serialize,
        Clone,
        Copy,
        Debug,
        Eq,
        Hash,
        Ord,
        PartialEq,
        PartialOrd
    )]
    pub enum Status2 {
        #[serde(rename = "up")]
        Up,
        #[serde(rename = "down")]
        Down,
    }
    impl ::std::convert::From<&Self> for Status2 {
        fn from(value: &Status2) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for Status2 {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Up => f.write_str("up"),
                Self::Down => f.write_str("down"),
            }
        }
    }
    impl ::std::str::FromStr for Status2 {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "up" => Ok(Self::Up),
                "down" => Ok(Self::Down),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for Status2 {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for Status2 {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for Status2 {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`SyncPanelBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "groups",
    ///    "issues"
    ///  ],
    ///  "properties": {
    ///    "batches": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "batch",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "batch": {
    ///            "$ref": "#/components/schemas/Batch"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 200
    ///    },
    ///    "groups": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "name",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "name": {
    ///            "type": "string",
    ///            "maxLength": 200,
    ///            "minLength": 1
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 200
    ///    },
    ///    "health": {
    ///      "allOf": [
    ///        {
    ///          "$ref": "#/components/schemas/PanelHealth"
    ///        }
    ///      ]
    ///    },
    ///    "issues": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "archived",
    ///          "issueId",
    ///          "key",
    ///          "lifeState",
    ///          "status",
    ///          "threadId",
    ///          "timeline",
    ///          "title",
    ///          "updatedAt"
    ///        ],
    ///        "properties": {
    ///          "archived": {
    ///            "type": "boolean"
    ///          },
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "key": {
    ///            "type": "string",
    ///            "maxLength": 120,
    ///            "minLength": 1
    ///          },
    ///          "lifeState": {
    ///            "$ref": "#/components/schemas/IssueLifeState"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "timeline": {
    ///            "type": "array",
    ///            "items": {
    ///              "oneOf": [
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "title"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "CREATED"
    ///                      ]
    ///                    },
    ///                    "title": {
    ///                      "type": "string"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "TURN_STARTED"
    ///                      ]
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "entryId",
    ///                    "id",
    ///                    "kind",
    ///                    "text",
    ///                    "transcriptKind"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "classification": {
    ///                      "$ref": "#/components/schemas/ClassificationMethod"
    ///                    },
    ///                    "entryId": {
    ///                      "type": "string",
    ///                      "format": "uuid",
    ///                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "MESSAGE"
    ///                      ]
    ///                    },
    ///                    "level": {
    ///                      "$ref": "#/components/schemas/IssueSignalLevel"
    ///                    },
    ///                    "routing": {
    ///                      "$ref": "#/components/schemas/OutputRouting"
    ///                    },
    ///                    "text": {
    ///                      "type": "string"
    ///                    },
    ///                    "transcriptKind": {
    ///                      "$ref": "#/components/schemas/TranscriptKind"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "reminder",
    ///                    "text"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "deliveredAt": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "STEER"
    ///                      ]
    ///                    },
    ///                    "readAt": {
    ///                      "type": "string"
    ///                    },
    ///                    "reminder": {
    ///                      "type": "boolean"
    ///                    },
    ///                    "text": {
    ///                      "type": "string"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "artifactId",
    ///                    "artifactKind",
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "name"
    ///                  ],
    ///                  "properties": {
    ///                    "artifactId": {
    ///                      "type": "string",
    ///                      "format": "uuid",
    ///                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                    },
    ///                    "artifactKind": {
    ///                      "$ref": "#/components/schemas/ArtifactKind"
    ///                    },
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "ARTIFACT"
    ///                      ]
    ///                    },
    ///                    "name": {
    ///                      "type": "string"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "stopId",
    ///                    "stopKind",
    ///                    "title"
    ///                  ],
    ///                  "properties": {
    ///                    "ask": {
    ///                      "type": "object",
    ///                      "required": [
    ///                        "code",
    ///                        "options",
    ///                        "question"
    ///                      ],
    ///                      "properties": {
    ///                        "code": {
    ///                          "type": "string"
    ///                        },
    ///                        "dueAt": {
    ///                          "type": "string"
    ///                        },
    ///                        "options": {
    ///                          "type": "array",
    ///                          "items": {
    ///                            "$ref": "#/components/schemas/AskOption"
    ///                          }
    ///                        },
    ///                        "question": {
    ///                          "type": "string"
    ///                        }
    ///                      }
    ///                    },
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "STOP_RAISED"
    ///                      ]
    ///                    },
    ///                    "stopId": {
    ///                      "type": "string",
    ///                      "format": "uuid",
    ///                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                    },
    ///                    "stopKind": {
    ///                      "$ref": "#/components/schemas/StopKind"
    ///                    },
    ///                    "title": {
    ///                      "type": "string"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "resolution",
    ///                    "stopId"
    ///                  ],
    ///                  "properties": {
    ///                    "answer": {
    ///                      "type": "object",
    ///                      "required": [
    ///                        "kind",
    ///                        "label"
    ///                      ],
    ///                      "properties": {
    ///                        "kind": {
    ///                          "$ref": "#/components/schemas/AskAnswerKind"
    ///                        },
    ///                        "label": {
    ///                          "type": "string"
    ///                        }
    ///                      }
    ///                    },
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "STOP_RESOLVED"
    ///                      ]
    ///                    },
    ///                    "resolution": {
    ///                      "$ref": "#/components/schemas/StopResolution"
    ///                    },
    ///                    "stopId": {
    ///                      "type": "string",
    ///                      "format": "uuid",
    ///                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "COMPLETED"
    ///                      ]
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "ARCHIVED"
    ///                      ]
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "source"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "by": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "PAUSED"
    ///                      ]
    ///                    },
    ///                    "source": {
    ///                      "$ref": "#/components/schemas/IssueControlSource"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "source"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "by": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "RESUMED"
    ///                      ]
    ///                    },
    ///                    "source": {
    ///                      "$ref": "#/components/schemas/IssueControlSource"
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "actionKind",
    ///                    "at",
    ///                    "id",
    ///                    "kind",
    ///                    "outcome",
    ///                    "waitedMs"
    ///                  ],
    ///                  "properties": {
    ///                    "actionKind": {
    ///                      "$ref": "#/components/schemas/IrreversibleActionKind"
    ///                    },
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "REGRET_WINDOW"
    ///                      ]
    ///                    },
    ///                    "outcome": {
    ///                      "$ref": "#/components/schemas/RegretWindowOutcome"
    ///                    },
    ///                    "waitedMs": {
    ///                      "type": "integer",
    ///                      "maximum": 9007199254740991.0,
    ///                      "minimum": 0.0
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "batchCode",
    ///                    "id",
    ///                    "kind",
    ///                    "n"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "batchCode": {
    ///                      "type": "string"
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "BATCH_LINKED"
    ///                      ]
    ///                    },
    ///                    "n": {
    ///                      "type": "integer",
    ///                      "maximum": 9007199254740991.0,
    ///                      "minimum": 1.0
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "at",
    ///                    "durationMs",
    ///                    "id",
    ///                    "kind",
    ///                    "outcome"
    ///                  ],
    ///                  "properties": {
    ///                    "at": {
    ///                      "type": "string"
    ///                    },
    ///                    "durationMs": {
    ///                      "type": "integer",
    ///                      "maximum": 9007199254740991.0,
    ///                      "minimum": 0.0
    ///                    },
    ///                    "exitCode": {
    ///                      "type": "integer",
    ///                      "maximum": 9007199254740991.0,
    ///                      "minimum": -9007199254740991.0
    ///                    },
    ///                    "id": {
    ///                      "type": "string"
    ///                    },
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "PUBLISH_RAN"
    ///                      ]
    ///                    },
    ///                    "outcome": {
    ///                      "$ref": "#/components/schemas/PublishRunOutcome"
    ///                    }
    ///                  }
    ///                }
    ///              ]
    ///            },
    ///            "maxItems": 2000
    ///          },
    ///          "title": {
    ///            "type": "string",
    ///            "maxLength": 400
    ///          },
    ///          "updatedAt": {
    ///            "type": "string",
    ///            "format": "date-time",
    ///            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///          },
    ///          "waitingForProviderUntil": {
    ///            "type": "string",
    ///            "format": "date-time",
    ///            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 500
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBody {
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub batches: ::std::vec::Vec<SyncPanelBodyBatchesItem>,
        pub groups: ::std::vec::Vec<SyncPanelBodyGroupsItem>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub health: ::std::option::Option<PanelHealth>,
        pub issues: ::std::vec::Vec<SyncPanelBodyIssuesItem>,
    }
    impl ::std::convert::From<&SyncPanelBody> for SyncPanelBody {
        fn from(value: &SyncPanelBody) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyBatchesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "batch",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "batch": {
    ///      "$ref": "#/components/schemas/Batch"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBodyBatchesItem {
        pub batch: Batch,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelBodyBatchesItem> for SyncPanelBodyBatchesItem {
        fn from(value: &SyncPanelBodyBatchesItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyGroupsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 200,
    ///      "minLength": 1
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBodyGroupsItem {
        pub name: SyncPanelBodyGroupsItemName,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelBodyGroupsItem> for SyncPanelBodyGroupsItem {
        fn from(value: &SyncPanelBodyGroupsItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyGroupsItemName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 200,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelBodyGroupsItemName(::std::string::String);
    impl ::std::ops::Deref for SyncPanelBodyGroupsItemName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelBodyGroupsItemName> for ::std::string::String {
        fn from(value: SyncPanelBodyGroupsItemName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelBodyGroupsItemName>
    for SyncPanelBodyGroupsItemName {
        fn from(value: &SyncPanelBodyGroupsItemName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelBodyGroupsItemName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 200usize {
                return Err("longer than 200 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelBodyGroupsItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelBodyGroupsItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SyncPanelBodyGroupsItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SyncPanelBodyGroupsItemName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelBodyIssuesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "archived",
    ///    "issueId",
    ///    "key",
    ///    "lifeState",
    ///    "status",
    ///    "threadId",
    ///    "timeline",
    ///    "title",
    ///    "updatedAt"
    ///  ],
    ///  "properties": {
    ///    "archived": {
    ///      "type": "boolean"
    ///    },
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "key": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    },
    ///    "lifeState": {
    ///      "$ref": "#/components/schemas/IssueLifeState"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "timeline": {
    ///      "type": "array",
    ///      "items": {
    ///        "oneOf": [
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "title"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "CREATED"
    ///                ]
    ///              },
    ///              "title": {
    ///                "type": "string"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "TURN_STARTED"
    ///                ]
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "entryId",
    ///              "id",
    ///              "kind",
    ///              "text",
    ///              "transcriptKind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "classification": {
    ///                "$ref": "#/components/schemas/ClassificationMethod"
    ///              },
    ///              "entryId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "MESSAGE"
    ///                ]
    ///              },
    ///              "level": {
    ///                "$ref": "#/components/schemas/IssueSignalLevel"
    ///              },
    ///              "routing": {
    ///                "$ref": "#/components/schemas/OutputRouting"
    ///              },
    ///              "text": {
    ///                "type": "string"
    ///              },
    ///              "transcriptKind": {
    ///                "$ref": "#/components/schemas/TranscriptKind"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "reminder",
    ///              "text"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "deliveredAt": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STEER"
    ///                ]
    ///              },
    ///              "readAt": {
    ///                "type": "string"
    ///              },
    ///              "reminder": {
    ///                "type": "boolean"
    ///              },
    ///              "text": {
    ///                "type": "string"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "artifactId",
    ///              "artifactKind",
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "name"
    ///            ],
    ///            "properties": {
    ///              "artifactId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "artifactKind": {
    ///                "$ref": "#/components/schemas/ArtifactKind"
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "ARTIFACT"
    ///                ]
    ///              },
    ///              "name": {
    ///                "type": "string"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "stopId",
    ///              "stopKind",
    ///              "title"
    ///            ],
    ///            "properties": {
    ///              "ask": {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "options",
    ///                  "question"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "dueAt": {
    ///                    "type": "string"
    ///                  },
    ///                  "options": {
    ///                    "type": "array",
    ///                    "items": {
    ///                      "$ref": "#/components/schemas/AskOption"
    ///                    }
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  }
    ///                }
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STOP_RAISED"
    ///                ]
    ///              },
    ///              "stopId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "stopKind": {
    ///                "$ref": "#/components/schemas/StopKind"
    ///              },
    ///              "title": {
    ///                "type": "string"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "resolution",
    ///              "stopId"
    ///            ],
    ///            "properties": {
    ///              "answer": {
    ///                "type": "object",
    ///                "required": [
    ///                  "kind",
    ///                  "label"
    ///                ],
    ///                "properties": {
    ///                  "kind": {
    ///                    "$ref": "#/components/schemas/AskAnswerKind"
    ///                  },
    ///                  "label": {
    ///                    "type": "string"
    ///                  }
    ///                }
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "STOP_RESOLVED"
    ///                ]
    ///              },
    ///              "resolution": {
    ///                "$ref": "#/components/schemas/StopResolution"
    ///              },
    ///              "stopId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "COMPLETED"
    ///                ]
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "ARCHIVED"
    ///                ]
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "source"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "by": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "PAUSED"
    ///                ]
    ///              },
    ///              "source": {
    ///                "$ref": "#/components/schemas/IssueControlSource"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "source"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "by": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "RESUMED"
    ///                ]
    ///              },
    ///              "source": {
    ///                "$ref": "#/components/schemas/IssueControlSource"
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "actionKind",
    ///              "at",
    ///              "id",
    ///              "kind",
    ///              "outcome",
    ///              "waitedMs"
    ///            ],
    ///            "properties": {
    ///              "actionKind": {
    ///                "$ref": "#/components/schemas/IrreversibleActionKind"
    ///              },
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "REGRET_WINDOW"
    ///                ]
    ///              },
    ///              "outcome": {
    ///                "$ref": "#/components/schemas/RegretWindowOutcome"
    ///              },
    ///              "waitedMs": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 0.0
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "batchCode",
    ///              "id",
    ///              "kind",
    ///              "n"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "batchCode": {
    ///                "type": "string"
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "BATCH_LINKED"
    ///                ]
    ///              },
    ///              "n": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 1.0
    ///              }
    ///            }
    ///          },
    ///          {
    ///            "type": "object",
    ///            "required": [
    ///              "at",
    ///              "durationMs",
    ///              "id",
    ///              "kind",
    ///              "outcome"
    ///            ],
    ///            "properties": {
    ///              "at": {
    ///                "type": "string"
    ///              },
    ///              "durationMs": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": 0.0
    ///              },
    ///              "exitCode": {
    ///                "type": "integer",
    ///                "maximum": 9007199254740991.0,
    ///                "minimum": -9007199254740991.0
    ///              },
    ///              "id": {
    ///                "type": "string"
    ///              },
    ///              "kind": {
    ///                "type": "string",
    ///                "enum": [
    ///                  "PUBLISH_RAN"
    ///                ]
    ///              },
    ///              "outcome": {
    ///                "$ref": "#/components/schemas/PublishRunOutcome"
    ///              }
    ///            }
    ///          }
    ///        ]
    ///      },
    ///      "maxItems": 2000
    ///    },
    ///    "title": {
    ///      "type": "string",
    ///      "maxLength": 400
    ///    },
    ///    "updatedAt": {
    ///      "type": "string",
    ///      "format": "date-time",
    ///      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///    },
    ///    "waitingForProviderUntil": {
    ///      "type": "string",
    ///      "format": "date-time",
    ///      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBodyIssuesItem {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: SyncPanelBodyIssuesItemKey,
        #[serde(rename = "lifeState")]
        pub life_state: ::codm_contracts_rust::wire::enums::IssueLifeState,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        pub timeline: ::std::vec::Vec<SyncPanelBodyIssuesItemTimelineItem>,
        pub title: SyncPanelBodyIssuesItemTitle,
        #[serde(rename = "updatedAt")]
        pub updated_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(
            rename = "waitingForProviderUntil",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub waiting_for_provider_until: ::std::option::Option<
            ::chrono::DateTime<::chrono::offset::Utc>,
        >,
    }
    impl ::std::convert::From<&SyncPanelBodyIssuesItem> for SyncPanelBodyIssuesItem {
        fn from(value: &SyncPanelBodyIssuesItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyIssuesItemKey`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelBodyIssuesItemKey(::std::string::String);
    impl ::std::ops::Deref for SyncPanelBodyIssuesItemKey {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelBodyIssuesItemKey> for ::std::string::String {
        fn from(value: SyncPanelBodyIssuesItemKey) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelBodyIssuesItemKey>
    for SyncPanelBodyIssuesItemKey {
        fn from(value: &SyncPanelBodyIssuesItemKey) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelBodyIssuesItemKey {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelBodyIssuesItemKey {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SyncPanelBodyIssuesItemKey {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SyncPanelBodyIssuesItemKey {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SyncPanelBodyIssuesItemKey {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelBodyIssuesItemTimelineItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "title"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "CREATED"
    ///          ]
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "TURN_STARTED"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "entryId",
    ///        "id",
    ///        "kind",
    ///        "text",
    ///        "transcriptKind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "classification": {
    ///          "$ref": "#/components/schemas/ClassificationMethod"
    ///        },
    ///        "entryId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "MESSAGE"
    ///          ]
    ///        },
    ///        "level": {
    ///          "$ref": "#/components/schemas/IssueSignalLevel"
    ///        },
    ///        "routing": {
    ///          "$ref": "#/components/schemas/OutputRouting"
    ///        },
    ///        "text": {
    ///          "type": "string"
    ///        },
    ///        "transcriptKind": {
    ///          "$ref": "#/components/schemas/TranscriptKind"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "reminder",
    ///        "text"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "deliveredAt": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STEER"
    ///          ]
    ///        },
    ///        "readAt": {
    ///          "type": "string"
    ///        },
    ///        "reminder": {
    ///          "type": "boolean"
    ///        },
    ///        "text": {
    ///          "type": "string"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "artifactId",
    ///        "artifactKind",
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "artifactId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "artifactKind": {
    ///          "$ref": "#/components/schemas/ArtifactKind"
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ARTIFACT"
    ///          ]
    ///        },
    ///        "name": {
    ///          "type": "string"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "stopId",
    ///        "stopKind",
    ///        "title"
    ///      ],
    ///      "properties": {
    ///        "ask": {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "options",
    ///            "question"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "dueAt": {
    ///              "type": "string"
    ///            },
    ///            "options": {
    ///              "type": "array",
    ///              "items": {
    ///                "$ref": "#/components/schemas/AskOption"
    ///              }
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            }
    ///          }
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STOP_RAISED"
    ///          ]
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "stopKind": {
    ///          "$ref": "#/components/schemas/StopKind"
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "resolution",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "answer": {
    ///          "type": "object",
    ///          "required": [
    ///            "kind",
    ///            "label"
    ///          ],
    ///          "properties": {
    ///            "kind": {
    ///              "$ref": "#/components/schemas/AskAnswerKind"
    ///            },
    ///            "label": {
    ///              "type": "string"
    ///            }
    ///          }
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STOP_RESOLVED"
    ///          ]
    ///        },
    ///        "resolution": {
    ///          "$ref": "#/components/schemas/StopResolution"
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "COMPLETED"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ARCHIVED"
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "source"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "by": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PAUSED"
    ///          ]
    ///        },
    ///        "source": {
    ///          "$ref": "#/components/schemas/IssueControlSource"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "source"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "by": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "RESUMED"
    ///          ]
    ///        },
    ///        "source": {
    ///          "$ref": "#/components/schemas/IssueControlSource"
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "actionKind",
    ///        "at",
    ///        "id",
    ///        "kind",
    ///        "outcome",
    ///        "waitedMs"
    ///      ],
    ///      "properties": {
    ///        "actionKind": {
    ///          "$ref": "#/components/schemas/IrreversibleActionKind"
    ///        },
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "REGRET_WINDOW"
    ///          ]
    ///        },
    ///        "outcome": {
    ///          "$ref": "#/components/schemas/RegretWindowOutcome"
    ///        },
    ///        "waitedMs": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "batchCode",
    ///        "id",
    ///        "kind",
    ///        "n"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "batchCode": {
    ///          "type": "string"
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "BATCH_LINKED"
    ///          ]
    ///        },
    ///        "n": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 1.0
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "at",
    ///        "durationMs",
    ///        "id",
    ///        "kind",
    ///        "outcome"
    ///      ],
    ///      "properties": {
    ///        "at": {
    ///          "type": "string"
    ///        },
    ///        "durationMs": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": 0.0
    ///        },
    ///        "exitCode": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "id": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PUBLISH_RAN"
    ///          ]
    ///        },
    ///        "outcome": {
    ///          "$ref": "#/components/schemas/PublishRunOutcome"
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind")]
    pub enum SyncPanelBodyIssuesItemTimelineItem {
        #[serde(rename = "CREATED")]
        Created {
            at: ::std::string::String,
            id: ::std::string::String,
            title: ::std::string::String,
        },
        #[serde(rename = "TURN_STARTED")]
        TurnStarted { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "MESSAGE")]
        Message {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            classification: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::ClassificationMethod,
            >,
            #[serde(rename = "entryId")]
            entry_id: ::uuid::Uuid,
            id: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            level: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::IssueSignalLevel,
            >,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            routing: ::std::option::Option<
                ::codm_contracts_rust::wire::enums::OutputRouting,
            >,
            text: ::std::string::String,
            #[serde(rename = "transcriptKind")]
            transcript_kind: ::codm_contracts_rust::wire::enums::TranscriptKind,
        },
        #[serde(rename = "STEER")]
        Steer {
            at: ::std::string::String,
            #[serde(
                rename = "deliveredAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            delivered_at: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            #[serde(
                rename = "readAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            read_at: ::std::option::Option<::std::string::String>,
            reminder: bool,
            text: ::std::string::String,
        },
        #[serde(rename = "ARTIFACT")]
        Artifact {
            #[serde(rename = "artifactId")]
            artifact_id: ::uuid::Uuid,
            #[serde(rename = "artifactKind")]
            artifact_kind: ::codm_contracts_rust::wire::enums::ArtifactKind,
            at: ::std::string::String,
            id: ::std::string::String,
            name: ::std::string::String,
        },
        #[serde(rename = "STOP_RAISED")]
        StopRaised {
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            ask: ::std::option::Option<SyncPanelBodyIssuesItemTimelineItemAsk>,
            at: ::std::string::String,
            id: ::std::string::String,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
            #[serde(rename = "stopKind")]
            stop_kind: ::codm_contracts_rust::wire::enums::StopKind,
            title: ::std::string::String,
        },
        #[serde(rename = "STOP_RESOLVED")]
        StopResolved {
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            answer: ::std::option::Option<SyncPanelBodyIssuesItemTimelineItemAnswer>,
            at: ::std::string::String,
            id: ::std::string::String,
            resolution: ::codm_contracts_rust::wire::enums::StopResolution,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
        #[serde(rename = "COMPLETED")]
        Completed { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "ARCHIVED")]
        Archived { at: ::std::string::String, id: ::std::string::String },
        #[serde(rename = "PAUSED")]
        Paused {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            by: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            source: ::codm_contracts_rust::wire::enums::IssueControlSource,
        },
        #[serde(rename = "RESUMED")]
        Resumed {
            at: ::std::string::String,
            #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
            by: ::std::option::Option<::std::string::String>,
            id: ::std::string::String,
            source: ::codm_contracts_rust::wire::enums::IssueControlSource,
        },
        #[serde(rename = "REGRET_WINDOW")]
        RegretWindow {
            #[serde(rename = "actionKind")]
            action_kind: ::codm_contracts_rust::wire::enums::IrreversibleActionKind,
            at: ::std::string::String,
            id: ::std::string::String,
            outcome: ::codm_contracts_rust::wire::enums::RegretWindowOutcome,
            #[serde(rename = "waitedMs")]
            waited_ms: i64,
        },
        #[serde(rename = "BATCH_LINKED")]
        BatchLinked {
            at: ::std::string::String,
            #[serde(rename = "batchCode")]
            batch_code: ::std::string::String,
            id: ::std::string::String,
            n: ::std::num::NonZeroU64,
        },
        #[serde(rename = "PUBLISH_RAN")]
        PublishRan {
            at: ::std::string::String,
            #[serde(rename = "durationMs")]
            duration_ms: i64,
            #[serde(
                rename = "exitCode",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            exit_code: ::std::option::Option<i64>,
            id: ::std::string::String,
            outcome: ::codm_contracts_rust::wire::enums::PublishRunOutcome,
        },
    }
    impl ::std::convert::From<&Self> for SyncPanelBodyIssuesItemTimelineItem {
        fn from(value: &SyncPanelBodyIssuesItemTimelineItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyIssuesItemTimelineItemAnswer`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "kind",
    ///    "label"
    ///  ],
    ///  "properties": {
    ///    "kind": {
    ///      "$ref": "#/components/schemas/AskAnswerKind"
    ///    },
    ///    "label": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBodyIssuesItemTimelineItemAnswer {
        pub kind: ::codm_contracts_rust::wire::enums::AskAnswerKind,
        pub label: ::std::string::String,
    }
    impl ::std::convert::From<&SyncPanelBodyIssuesItemTimelineItemAnswer>
    for SyncPanelBodyIssuesItemTimelineItemAnswer {
        fn from(value: &SyncPanelBodyIssuesItemTimelineItemAnswer) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyIssuesItemTimelineItemAsk`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "options",
    ///    "question"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string"
    ///    },
    ///    "dueAt": {
    ///      "type": "string"
    ///    },
    ///    "options": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/AskOption"
    ///      }
    ///    },
    ///    "question": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelBodyIssuesItemTimelineItemAsk {
        pub code: ::std::string::String,
        #[serde(
            rename = "dueAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub due_at: ::std::option::Option<::std::string::String>,
        pub options: ::std::vec::Vec<AskOption>,
        pub question: ::std::string::String,
    }
    impl ::std::convert::From<&SyncPanelBodyIssuesItemTimelineItemAsk>
    for SyncPanelBodyIssuesItemTimelineItemAsk {
        fn from(value: &SyncPanelBodyIssuesItemTimelineItemAsk) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelBodyIssuesItemTitle`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 400
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelBodyIssuesItemTitle(::std::string::String);
    impl ::std::ops::Deref for SyncPanelBodyIssuesItemTitle {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelBodyIssuesItemTitle> for ::std::string::String {
        fn from(value: SyncPanelBodyIssuesItemTitle) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelBodyIssuesItemTitle>
    for SyncPanelBodyIssuesItemTitle {
        fn from(value: &SyncPanelBodyIssuesItemTitle) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelBodyIssuesItemTitle {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 400usize {
                return Err("longer than 400 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelBodyIssuesItemTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelBodyIssuesItemTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelBodyIssuesItemTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SyncPanelBodyIssuesItemTitle {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "groups"
    ///  ],
    ///  "properties": {
    ///    "groups": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "threadId",
    ///          "token"
    ///        ],
    ///        "properties": {
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "token": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SyncPanelResponse {
        pub groups: ::std::vec::Vec<SyncPanelResponseGroupsItem>,
    }
    impl ::std::convert::From<&SyncPanelResponse> for SyncPanelResponse {
        fn from(value: &SyncPanelResponse) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelResponseGroupsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "threadId",
    ///    "token"
    ///  ],
    ///  "properties": {
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "token": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SyncPanelResponseGroupsItem {
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        pub token: ::std::string::String,
    }
    impl ::std::convert::From<&SyncPanelResponseGroupsItem>
    for SyncPanelResponseGroupsItem {
        fn from(value: &SyncPanelResponseGroupsItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "groups"
    ///  ],
    ///  "properties": {
    ///    "groups": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "members",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "members": {
    ///            "type": "array",
    ///            "items": {
    ///              "type": "object",
    ///              "required": [
    ///                "canRelease",
    ///                "memberId",
    ///                "name"
    ///              ],
    ///              "properties": {
    ///                "canRelease": {
    ///                  "type": "boolean"
    ///                },
    ///                "memberId": {
    ///                  "type": "string",
    ///                  "maxLength": 64,
    ///                  "minLength": 16,
    ///                  "pattern": "^[A-Za-z0-9_-]+$"
    ///                },
    ///                "name": {
    ///                  "type": "string",
    ///                  "maxLength": 120,
    ///                  "minLength": 1
    ///                }
    ///              }
    ///            },
    ///            "maxItems": 1024
    ///          },
    ///          "openStops": {
    ///            "type": "array",
    ///            "items": {
    ///              "type": "object",
    ///              "required": [
    ///                "issueId",
    ///                "kind",
    ///                "resolutions",
    ///                "stopId"
    ///              ],
    ///              "properties": {
    ///                "ask": {
    ///                  "oneOf": [
    ///                    {
    ///                      "type": "object",
    ///                      "required": [
    ///                        "code",
    ///                        "kind",
    ///                        "question",
    ///                        "releaseRequired",
    ///                        "reply"
    ///                      ],
    ///                      "properties": {
    ///                        "code": {
    ///                          "type": "string"
    ///                        },
    ///                        "kind": {
    ///                          "type": "string",
    ///                          "enum": [
    ///                            "DECISION_REQUESTED"
    ///                          ]
    ///                        },
    ///                        "question": {
    ///                          "type": "string"
    ///                        },
    ///                        "releaseRequired": {
    ///                          "type": "boolean"
    ///                        },
    ///                        "reply": {
    ///                          "oneOf": [
    ///                            {
    ///                              "type": "object",
    ///                              "required": [
    ///                                "kind",
    ///                                "options"
    ///                              ],
    ///                              "properties": {
    ///                                "kind": {
    ///                                  "type": "string",
    ///                                  "enum": [
    ///                                    "OPTION"
    ///                                  ]
    ///                                },
    ///                                "options": {
    ///                                  "type": "array",
    ///                                  "items": {
    ///                                    "$ref": "#/components/schemas/AskOption"
    ///                                  },
    ///                                  "maxItems": 6,
    ///                                  "minItems": 1
    ///                                }
    ///                              }
    ///                            },
    ///                            {
    ///                              "type": "object",
    ///                              "required": [
    ///                                "kind"
    ///                              ],
    ///                              "properties": {
    ///                                "kind": {
    ///                                  "type": "string",
    ///                                  "enum": [
    ///                                    "TEXT"
    ///                                  ]
    ///                                }
    ///                              }
    ///                            }
    ///                          ]
    ///                        }
    ///                      }
    ///                    },
    ///                    {
    ///                      "type": "object",
    ///                      "required": [
    ///                        "code",
    ///                        "defaultLabel",
    ///                        "kind",
    ///                        "question",
    ///                        "reply"
    ///                      ],
    ///                      "properties": {
    ///                        "code": {
    ///                          "type": "string"
    ///                        },
    ///                        "defaultLabel": {
    ///                          "type": "string"
    ///                        },
    ///                        "dueAt": {
    ///                          "type": "string"
    ///                        },
    ///                        "kind": {
    ///                          "type": "string",
    ///                          "enum": [
    ///                            "QUESTION_ASKED"
    ///                          ]
    ///                        },
    ///                        "question": {
    ///                          "type": "string"
    ///                        },
    ///                        "reply": {
    ///                          "oneOf": [
    ///                            {
    ///                              "type": "object",
    ///                              "required": [
    ///                                "kind",
    ///                                "options"
    ///                              ],
    ///                              "properties": {
    ///                                "kind": {
    ///                                  "type": "string",
    ///                                  "enum": [
    ///                                    "OPTION"
    ///                                  ]
    ///                                },
    ///                                "options": {
    ///                                  "type": "array",
    ///                                  "items": {
    ///                                    "$ref": "#/components/schemas/AskOption"
    ///                                  },
    ///                                  "maxItems": 6,
    ///                                  "minItems": 1
    ///                                }
    ///                              }
    ///                            },
    ///                            {
    ///                              "type": "object",
    ///                              "required": [
    ///                                "kind"
    ///                              ],
    ///                              "properties": {
    ///                                "kind": {
    ///                                  "type": "string",
    ///                                  "enum": [
    ///                                    "TEXT"
    ///                                  ]
    ///                                }
    ///                              }
    ///                            }
    ///                          ]
    ///                        }
    ///                      }
    ///                    }
    ///                  ]
    ///                },
    ///                "issueId": {
    ///                  "type": "string",
    ///                  "format": "uuid",
    ///                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                },
    ///                "kind": {
    ///                  "$ref": "#/components/schemas/StopKind"
    ///                },
    ///                "resolutions": {
    ///                  "type": "array",
    ///                  "items": {
    ///                    "$ref": "#/components/schemas/StopResolution"
    ///                  },
    ///                  "maxItems": 8
    ///                },
    ///                "stopId": {
    ///                  "type": "string",
    ///                  "format": "uuid",
    ///                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                }
    ///              }
    ///            },
    ///            "maxItems": 200
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 200
    ///    },
    ///    "outcomes": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "actionId",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "actionId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "code": {
    ///            "type": "string",
    ///            "maxLength": 80
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/PanelActionOutcome"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 500
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelRosterBody {
        pub groups: ::std::vec::Vec<SyncPanelRosterBodyGroupsItem>,
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub outcomes: ::std::vec::Vec<SyncPanelRosterBodyOutcomesItem>,
    }
    impl ::std::convert::From<&SyncPanelRosterBody> for SyncPanelRosterBody {
        fn from(value: &SyncPanelRosterBody) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyGroupsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "members",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "members": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "canRelease",
    ///          "memberId",
    ///          "name"
    ///        ],
    ///        "properties": {
    ///          "canRelease": {
    ///            "type": "boolean"
    ///          },
    ///          "memberId": {
    ///            "type": "string",
    ///            "maxLength": 64,
    ///            "minLength": 16,
    ///            "pattern": "^[A-Za-z0-9_-]+$"
    ///          },
    ///          "name": {
    ///            "type": "string",
    ///            "maxLength": 120,
    ///            "minLength": 1
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 1024
    ///    },
    ///    "openStops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "issueId",
    ///          "kind",
    ///          "resolutions",
    ///          "stopId"
    ///        ],
    ///        "properties": {
    ///          "ask": {
    ///            "oneOf": [
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "kind",
    ///                  "question",
    ///                  "releaseRequired",
    ///                  "reply"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "DECISION_REQUESTED"
    ///                    ]
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  },
    ///                  "releaseRequired": {
    ///                    "type": "boolean"
    ///                  },
    ///                  "reply": {
    ///                    "oneOf": [
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind",
    ///                          "options"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "OPTION"
    ///                            ]
    ///                          },
    ///                          "options": {
    ///                            "type": "array",
    ///                            "items": {
    ///                              "$ref": "#/components/schemas/AskOption"
    ///                            },
    ///                            "maxItems": 6,
    ///                            "minItems": 1
    ///                          }
    ///                        }
    ///                      },
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "TEXT"
    ///                            ]
    ///                          }
    ///                        }
    ///                      }
    ///                    ]
    ///                  }
    ///                }
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "code",
    ///                  "defaultLabel",
    ///                  "kind",
    ///                  "question",
    ///                  "reply"
    ///                ],
    ///                "properties": {
    ///                  "code": {
    ///                    "type": "string"
    ///                  },
    ///                  "defaultLabel": {
    ///                    "type": "string"
    ///                  },
    ///                  "dueAt": {
    ///                    "type": "string"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "QUESTION_ASKED"
    ///                    ]
    ///                  },
    ///                  "question": {
    ///                    "type": "string"
    ///                  },
    ///                  "reply": {
    ///                    "oneOf": [
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind",
    ///                          "options"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "OPTION"
    ///                            ]
    ///                          },
    ///                          "options": {
    ///                            "type": "array",
    ///                            "items": {
    ///                              "$ref": "#/components/schemas/AskOption"
    ///                            },
    ///                            "maxItems": 6,
    ///                            "minItems": 1
    ///                          }
    ///                        }
    ///                      },
    ///                      {
    ///                        "type": "object",
    ///                        "required": [
    ///                          "kind"
    ///                        ],
    ///                        "properties": {
    ///                          "kind": {
    ///                            "type": "string",
    ///                            "enum": [
    ///                              "TEXT"
    ///                            ]
    ///                          }
    ///                        }
    ///                      }
    ///                    ]
    ///                  }
    ///                }
    ///              }
    ///            ]
    ///          },
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          },
    ///          "resolutions": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/StopResolution"
    ///            },
    ///            "maxItems": 8
    ///          },
    ///          "stopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        }
    ///      },
    ///      "maxItems": 200
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelRosterBodyGroupsItem {
        pub members: ::std::vec::Vec<SyncPanelRosterBodyGroupsItemMembersItem>,
        #[serde(
            rename = "openStops",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub open_stops: ::std::vec::Vec<SyncPanelRosterBodyGroupsItemOpenStopsItem>,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelRosterBodyGroupsItem>
    for SyncPanelRosterBodyGroupsItem {
        fn from(value: &SyncPanelRosterBodyGroupsItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyGroupsItemMembersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "canRelease",
    ///    "memberId",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "canRelease": {
    ///      "type": "boolean"
    ///    },
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 16,
    ///      "pattern": "^[A-Za-z0-9_-]+$"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelRosterBodyGroupsItemMembersItem {
        #[serde(rename = "canRelease")]
        pub can_release: bool,
        #[serde(rename = "memberId")]
        pub member_id: SyncPanelRosterBodyGroupsItemMembersItemMemberId,
        pub name: SyncPanelRosterBodyGroupsItemMembersItemName,
    }
    impl ::std::convert::From<&SyncPanelRosterBodyGroupsItemMembersItem>
    for SyncPanelRosterBodyGroupsItemMembersItem {
        fn from(value: &SyncPanelRosterBodyGroupsItemMembersItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyGroupsItemMembersItemMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 16,
    ///  "pattern": "^[A-Za-z0-9_-]+$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelRosterBodyGroupsItemMembersItemMemberId(::std::string::String);
    impl ::std::ops::Deref for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelRosterBodyGroupsItemMembersItemMemberId>
    for ::std::string::String {
        fn from(value: SyncPanelRosterBodyGroupsItemMembersItemMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelRosterBodyGroupsItemMembersItemMemberId>
    for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        fn from(value: &SyncPanelRosterBodyGroupsItemMembersItemMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 16usize {
                return Err("shorter than 16 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^[A-Za-z0-9_-]+$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^[A-Za-z0-9_-]+$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str>
    for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for SyncPanelRosterBodyGroupsItemMembersItemMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelRosterBodyGroupsItemMembersItemName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelRosterBodyGroupsItemMembersItemName(::std::string::String);
    impl ::std::ops::Deref for SyncPanelRosterBodyGroupsItemMembersItemName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelRosterBodyGroupsItemMembersItemName>
    for ::std::string::String {
        fn from(value: SyncPanelRosterBodyGroupsItemMembersItemName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelRosterBodyGroupsItemMembersItemName>
    for SyncPanelRosterBodyGroupsItemMembersItemName {
        fn from(value: &SyncPanelRosterBodyGroupsItemMembersItemName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelRosterBodyGroupsItemMembersItemName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelRosterBodyGroupsItemMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelRosterBodyGroupsItemMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelRosterBodyGroupsItemMembersItemName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for SyncPanelRosterBodyGroupsItemMembersItemName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelRosterBodyGroupsItemOpenStopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "kind",
    ///    "resolutions",
    ///    "stopId"
    ///  ],
    ///  "properties": {
    ///    "ask": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "kind",
    ///            "question",
    ///            "releaseRequired",
    ///            "reply"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "DECISION_REQUESTED"
    ///              ]
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            },
    ///            "releaseRequired": {
    ///              "type": "boolean"
    ///            },
    ///            "reply": {
    ///              "oneOf": [
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind",
    ///                    "options"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "OPTION"
    ///                      ]
    ///                    },
    ///                    "options": {
    ///                      "type": "array",
    ///                      "items": {
    ///                        "$ref": "#/components/schemas/AskOption"
    ///                      },
    ///                      "maxItems": 6,
    ///                      "minItems": 1
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "TEXT"
    ///                      ]
    ///                    }
    ///                  }
    ///                }
    ///              ]
    ///            }
    ///          }
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "code",
    ///            "defaultLabel",
    ///            "kind",
    ///            "question",
    ///            "reply"
    ///          ],
    ///          "properties": {
    ///            "code": {
    ///              "type": "string"
    ///            },
    ///            "defaultLabel": {
    ///              "type": "string"
    ///            },
    ///            "dueAt": {
    ///              "type": "string"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "QUESTION_ASKED"
    ///              ]
    ///            },
    ///            "question": {
    ///              "type": "string"
    ///            },
    ///            "reply": {
    ///              "oneOf": [
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind",
    ///                    "options"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "OPTION"
    ///                      ]
    ///                    },
    ///                    "options": {
    ///                      "type": "array",
    ///                      "items": {
    ///                        "$ref": "#/components/schemas/AskOption"
    ///                      },
    ///                      "maxItems": 6,
    ///                      "minItems": 1
    ///                    }
    ///                  }
    ///                },
    ///                {
    ///                  "type": "object",
    ///                  "required": [
    ///                    "kind"
    ///                  ],
    ///                  "properties": {
    ///                    "kind": {
    ///                      "type": "string",
    ///                      "enum": [
    ///                        "TEXT"
    ///                      ]
    ///                    }
    ///                  }
    ///                }
    ///              ]
    ///            }
    ///          }
    ///        }
    ///      ]
    ///    },
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    },
    ///    "resolutions": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/StopResolution"
    ///      },
    ///      "maxItems": 8
    ///    },
    ///    "stopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelRosterBodyGroupsItemOpenStopsItem {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub ask: ::std::option::Option<SyncPanelRosterBodyGroupsItemOpenStopsItemAsk>,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
        pub resolutions: ::std::vec::Vec<
            ::codm_contracts_rust::wire::enums::StopResolution,
        >,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelRosterBodyGroupsItemOpenStopsItem>
    for SyncPanelRosterBodyGroupsItemOpenStopsItem {
        fn from(value: &SyncPanelRosterBodyGroupsItemOpenStopsItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyGroupsItemOpenStopsItemAsk`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "code",
    ///        "kind",
    ///        "question",
    ///        "releaseRequired",
    ///        "reply"
    ///      ],
    ///      "properties": {
    ///        "code": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DECISION_REQUESTED"
    ///          ]
    ///        },
    ///        "question": {
    ///          "type": "string"
    ///        },
    ///        "releaseRequired": {
    ///          "type": "boolean"
    ///        },
    ///        "reply": {
    ///          "oneOf": [
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind",
    ///                "options"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "OPTION"
    ///                  ]
    ///                },
    ///                "options": {
    ///                  "type": "array",
    ///                  "items": {
    ///                    "$ref": "#/components/schemas/AskOption"
    ///                  },
    ///                  "maxItems": 6,
    ///                  "minItems": 1
    ///                }
    ///              }
    ///            },
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "TEXT"
    ///                  ]
    ///                }
    ///              }
    ///            }
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "code",
    ///        "defaultLabel",
    ///        "kind",
    ///        "question",
    ///        "reply"
    ///      ],
    ///      "properties": {
    ///        "code": {
    ///          "type": "string"
    ///        },
    ///        "defaultLabel": {
    ///          "type": "string"
    ///        },
    ///        "dueAt": {
    ///          "type": "string"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "QUESTION_ASKED"
    ///          ]
    ///        },
    ///        "question": {
    ///          "type": "string"
    ///        },
    ///        "reply": {
    ///          "oneOf": [
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind",
    ///                "options"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "OPTION"
    ///                  ]
    ///                },
    ///                "options": {
    ///                  "type": "array",
    ///                  "items": {
    ///                    "$ref": "#/components/schemas/AskOption"
    ///                  },
    ///                  "maxItems": 6,
    ///                  "minItems": 1
    ///                }
    ///              }
    ///            },
    ///            {
    ///              "type": "object",
    ///              "required": [
    ///                "kind"
    ///              ],
    ///              "properties": {
    ///                "kind": {
    ///                  "type": "string",
    ///                  "enum": [
    ///                    "TEXT"
    ///                  ]
    ///                }
    ///              }
    ///            }
    ///          ]
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind")]
    pub enum SyncPanelRosterBodyGroupsItemOpenStopsItemAsk {
        #[serde(rename = "DECISION_REQUESTED")]
        DecisionRequested {
            code: ::std::string::String,
            question: ::std::string::String,
            #[serde(rename = "releaseRequired")]
            release_required: bool,
            reply: SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply,
        },
        #[serde(rename = "QUESTION_ASKED")]
        QuestionAsked {
            code: ::std::string::String,
            #[serde(rename = "defaultLabel")]
            default_label: ::std::string::String,
            #[serde(
                rename = "dueAt",
                default,
                skip_serializing_if = "::std::option::Option::is_none"
            )]
            due_at: ::std::option::Option<::std::string::String>,
            question: ::std::string::String,
            reply: SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply,
        },
    }
    impl ::std::convert::From<&Self> for SyncPanelRosterBodyGroupsItemOpenStopsItemAsk {
        fn from(value: &SyncPanelRosterBodyGroupsItemOpenStopsItemAsk) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind",
    ///        "options"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "OPTION"
    ///          ]
    ///        },
    ///        "options": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/AskOption"
    ///          },
    ///          "maxItems": 6,
    ///          "minItems": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "TEXT"
    ///          ]
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", content = "options")]
    pub enum SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply {
        #[serde(rename = "OPTION")]
        Option(::std::vec::Vec<AskOption>),
        #[serde(rename = "TEXT")]
        Text,
    }
    impl ::std::convert::From<&Self>
    for SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply {
        fn from(value: &SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<::std::vec::Vec<AskOption>>
    for SyncPanelRosterBodyGroupsItemOpenStopsItemAskReply {
        fn from(value: ::std::vec::Vec<AskOption>) -> Self {
            Self::Option(value)
        }
    }
    ///`SyncPanelRosterBodyOutcomesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "actionId",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "actionId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "code": {
    ///      "type": "string",
    ///      "maxLength": 80
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/PanelActionOutcome"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SyncPanelRosterBodyOutcomesItem {
        #[serde(rename = "actionId")]
        pub action_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub code: ::std::option::Option<SyncPanelRosterBodyOutcomesItemCode>,
        pub status: ::codm_contracts_rust::wire::enums::PanelActionOutcome,
    }
    impl ::std::convert::From<&SyncPanelRosterBodyOutcomesItem>
    for SyncPanelRosterBodyOutcomesItem {
        fn from(value: &SyncPanelRosterBodyOutcomesItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterBodyOutcomesItemCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 80
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelRosterBodyOutcomesItemCode(::std::string::String);
    impl ::std::ops::Deref for SyncPanelRosterBodyOutcomesItemCode {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelRosterBodyOutcomesItemCode>
    for ::std::string::String {
        fn from(value: SyncPanelRosterBodyOutcomesItemCode) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelRosterBodyOutcomesItemCode>
    for SyncPanelRosterBodyOutcomesItemCode {
        fn from(value: &SyncPanelRosterBodyOutcomesItemCode) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelRosterBodyOutcomesItemCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 80usize {
                return Err("longer than 80 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelRosterBodyOutcomesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelRosterBodyOutcomesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelRosterBodyOutcomesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SyncPanelRosterBodyOutcomesItemCode {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelRosterResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "actions",
    ///    "deliveries"
    ///  ],
    ///  "properties": {
    ///    "actions": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "action",
    ///          "actionId",
    ///          "memberId",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "action": {
    ///            "oneOf": [
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "issueId",
    ///                  "kind"
    ///                ],
    ///                "properties": {
    ///                  "issueId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "PAUSE"
    ///                    ]
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "issueId",
    ///                  "kind"
    ///                ],
    ///                "properties": {
    ///                  "issueId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "RESUME"
    ///                    ]
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "issueId",
    ///                  "kind",
    ///                  "text"
    ///                ],
    ///                "properties": {
    ///                  "issueId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "STEER"
    ///                    ]
    ///                  },
    ///                  "text": {
    ///                    "type": "string",
    ///                    "maxLength": 2000,
    ///                    "minLength": 1
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "issueId",
    ///                  "kind",
    ///                  "resolution",
    ///                  "stopId"
    ///                ],
    ///                "properties": {
    ///                  "issueId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "ANSWER_STOP"
    ///                    ]
    ///                  },
    ///                  "resolution": {
    ///                    "$ref": "#/components/schemas/StopResolution"
    ///                  },
    ///                  "stopId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "answer",
    ///                  "issueId",
    ///                  "kind",
    ///                  "stopId"
    ///                ],
    ///                "properties": {
    ///                  "answer": {
    ///                    "$ref": "#/components/schemas/AskAnswer"
    ///                  },
    ///                  "issueId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "ANSWER_ASK"
    ///                    ]
    ///                  },
    ///                  "stopId": {
    ///                    "type": "string",
    ///                    "format": "uuid",
    ///                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              }
    ///            ]
    ///          },
    ///          "actionId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "memberId": {
    ///            "type": "string"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "deliveries": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "code",
    ///          "memberId",
    ///          "requestId",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "code": {
    ///            "type": "string",
    ///            "pattern": "^\\d{6}$"
    ///          },
    ///          "memberId": {
    ///            "type": "string"
    ///          },
    ///          "requestId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SyncPanelRosterResponse {
        pub actions: ::std::vec::Vec<SyncPanelRosterResponseActionsItem>,
        pub deliveries: ::std::vec::Vec<SyncPanelRosterResponseDeliveriesItem>,
    }
    impl ::std::convert::From<&SyncPanelRosterResponse> for SyncPanelRosterResponse {
        fn from(value: &SyncPanelRosterResponse) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterResponseActionsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "action",
    ///    "actionId",
    ///    "memberId",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "action": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "issueId",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "issueId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "PAUSE"
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "issueId",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "issueId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "RESUME"
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "issueId",
    ///            "kind",
    ///            "text"
    ///          ],
    ///          "properties": {
    ///            "issueId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "STEER"
    ///              ]
    ///            },
    ///            "text": {
    ///              "type": "string",
    ///              "maxLength": 2000,
    ///              "minLength": 1
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "issueId",
    ///            "kind",
    ///            "resolution",
    ///            "stopId"
    ///          ],
    ///          "properties": {
    ///            "issueId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "ANSWER_STOP"
    ///              ]
    ///            },
    ///            "resolution": {
    ///              "$ref": "#/components/schemas/StopResolution"
    ///            },
    ///            "stopId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "answer",
    ///            "issueId",
    ///            "kind",
    ///            "stopId"
    ///          ],
    ///          "properties": {
    ///            "answer": {
    ///              "$ref": "#/components/schemas/AskAnswer"
    ///            },
    ///            "issueId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "ANSWER_ASK"
    ///              ]
    ///            },
    ///            "stopId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      ]
    ///    },
    ///    "actionId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "memberId": {
    ///      "type": "string"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SyncPanelRosterResponseActionsItem {
        pub action: SyncPanelRosterResponseActionsItemAction,
        #[serde(rename = "actionId")]
        pub action_id: ::uuid::Uuid,
        #[serde(rename = "memberId")]
        pub member_id: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelRosterResponseActionsItem>
    for SyncPanelRosterResponseActionsItem {
        fn from(value: &SyncPanelRosterResponseActionsItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterResponseActionsItemAction`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "PAUSE"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "RESUME"
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind",
    ///        "text"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "STEER"
    ///          ]
    ///        },
    ///        "text": {
    ///          "type": "string",
    ///          "maxLength": 2000,
    ///          "minLength": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "issueId",
    ///        "kind",
    ///        "resolution",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ANSWER_STOP"
    ///          ]
    ///        },
    ///        "resolution": {
    ///          "$ref": "#/components/schemas/StopResolution"
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "answer",
    ///        "issueId",
    ///        "kind",
    ///        "stopId"
    ///      ],
    ///      "properties": {
    ///        "answer": {
    ///          "$ref": "#/components/schemas/AskAnswer"
    ///        },
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "ANSWER_ASK"
    ///          ]
    ///        },
    ///        "stopId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", deny_unknown_fields)]
    pub enum SyncPanelRosterResponseActionsItemAction {
        #[serde(rename = "PAUSE")]
        Pause { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "RESUME")]
        Resume { #[serde(rename = "issueId")] issue_id: ::uuid::Uuid },
        #[serde(rename = "STEER")]
        Steer {
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            text: SyncPanelRosterResponseActionsItemActionText,
        },
        #[serde(rename = "ANSWER_STOP")]
        AnswerStop {
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            resolution: ::codm_contracts_rust::wire::enums::StopResolution,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
        #[serde(rename = "ANSWER_ASK")]
        AnswerAsk {
            answer: AskAnswer,
            #[serde(rename = "issueId")]
            issue_id: ::uuid::Uuid,
            #[serde(rename = "stopId")]
            stop_id: ::uuid::Uuid,
        },
    }
    impl ::std::convert::From<&Self> for SyncPanelRosterResponseActionsItemAction {
        fn from(value: &SyncPanelRosterResponseActionsItemAction) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterResponseActionsItemActionText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 2000,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelRosterResponseActionsItemActionText(::std::string::String);
    impl ::std::ops::Deref for SyncPanelRosterResponseActionsItemActionText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelRosterResponseActionsItemActionText>
    for ::std::string::String {
        fn from(value: SyncPanelRosterResponseActionsItemActionText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelRosterResponseActionsItemActionText>
    for SyncPanelRosterResponseActionsItemActionText {
        fn from(value: &SyncPanelRosterResponseActionsItemActionText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelRosterResponseActionsItemActionText {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 2000usize {
                return Err("longer than 2000 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelRosterResponseActionsItemActionText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelRosterResponseActionsItemActionText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelRosterResponseActionsItemActionText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for SyncPanelRosterResponseActionsItemActionText {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`SyncPanelRosterResponseDeliveriesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "memberId",
    ///    "requestId",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string",
    ///      "pattern": "^\\d{6}$"
    ///    },
    ///    "memberId": {
    ///      "type": "string"
    ///    },
    ///    "requestId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SyncPanelRosterResponseDeliveriesItem {
        pub code: SyncPanelRosterResponseDeliveriesItemCode,
        #[serde(rename = "memberId")]
        pub member_id: ::std::string::String,
        #[serde(rename = "requestId")]
        pub request_id: ::uuid::Uuid,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SyncPanelRosterResponseDeliveriesItem>
    for SyncPanelRosterResponseDeliveriesItem {
        fn from(value: &SyncPanelRosterResponseDeliveriesItem) -> Self {
            value.clone()
        }
    }
    ///`SyncPanelRosterResponseDeliveriesItemCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "pattern": "^\\d{6}$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SyncPanelRosterResponseDeliveriesItemCode(::std::string::String);
    impl ::std::ops::Deref for SyncPanelRosterResponseDeliveriesItemCode {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SyncPanelRosterResponseDeliveriesItemCode>
    for ::std::string::String {
        fn from(value: SyncPanelRosterResponseDeliveriesItemCode) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SyncPanelRosterResponseDeliveriesItemCode>
    for SyncPanelRosterResponseDeliveriesItemCode {
        fn from(value: &SyncPanelRosterResponseDeliveriesItemCode) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SyncPanelRosterResponseDeliveriesItemCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^\\d{6}$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^\\d{6}$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SyncPanelRosterResponseDeliveriesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SyncPanelRosterResponseDeliveriesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SyncPanelRosterResponseDeliveriesItemCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SyncPanelRosterResponseDeliveriesItemCode {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`UpdateOwnerSettingsBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    },
    ///    "pictureUrl": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "uri"
    ///    },
    ///    "timezone": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UpdateOwnerSettingsBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub name: ::std::option::Option<UpdateOwnerSettingsBodyName>,
        #[serde(
            rename = "pictureUrl",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub picture_url: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub timezone: ::std::option::Option<UpdateOwnerSettingsBodyTimezone>,
    }
    impl ::std::convert::From<&UpdateOwnerSettingsBody> for UpdateOwnerSettingsBody {
        fn from(value: &UpdateOwnerSettingsBody) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for UpdateOwnerSettingsBody {
        fn default() -> Self {
            Self {
                name: Default::default(),
                picture_url: Default::default(),
                timezone: Default::default(),
            }
        }
    }
    ///`UpdateOwnerSettingsBodyName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct UpdateOwnerSettingsBodyName(::std::string::String);
    impl ::std::ops::Deref for UpdateOwnerSettingsBodyName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<UpdateOwnerSettingsBodyName> for ::std::string::String {
        fn from(value: UpdateOwnerSettingsBodyName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&UpdateOwnerSettingsBodyName>
    for UpdateOwnerSettingsBodyName {
        fn from(value: &UpdateOwnerSettingsBodyName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for UpdateOwnerSettingsBodyName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for UpdateOwnerSettingsBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateOwnerSettingsBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for UpdateOwnerSettingsBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for UpdateOwnerSettingsBodyName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`UpdateOwnerSettingsBodyTimezone`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct UpdateOwnerSettingsBodyTimezone(::std::string::String);
    impl ::std::ops::Deref for UpdateOwnerSettingsBodyTimezone {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<UpdateOwnerSettingsBodyTimezone>
    for ::std::string::String {
        fn from(value: UpdateOwnerSettingsBodyTimezone) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&UpdateOwnerSettingsBodyTimezone>
    for UpdateOwnerSettingsBodyTimezone {
        fn from(value: &UpdateOwnerSettingsBodyTimezone) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for UpdateOwnerSettingsBodyTimezone {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for UpdateOwnerSettingsBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateOwnerSettingsBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for UpdateOwnerSettingsBodyTimezone {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for UpdateOwnerSettingsBodyTimezone {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`UploadAvatarResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "pictureUrl"
    ///  ],
    ///  "properties": {
    ///    "pictureUrl": {
    ///      "type": "string",
    ///      "format": "uri"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct UploadAvatarResponse {
        #[serde(rename = "pictureUrl")]
        pub picture_url: ::std::string::String,
    }
    impl ::std::convert::From<&UploadAvatarResponse> for UploadAvatarResponse {
        fn from(value: &UploadAvatarResponse) -> Self {
            value.clone()
        }
    }
    ///`VerifyPanelCodeBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "memberId"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string",
    ///      "pattern": "^\\d{6}$"
    ///    },
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct VerifyPanelCodeBody {
        pub code: VerifyPanelCodeBodyCode,
        #[serde(rename = "memberId")]
        pub member_id: VerifyPanelCodeBodyMemberId,
    }
    impl ::std::convert::From<&VerifyPanelCodeBody> for VerifyPanelCodeBody {
        fn from(value: &VerifyPanelCodeBody) -> Self {
            value.clone()
        }
    }
    ///`VerifyPanelCodeBodyCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "pattern": "^\\d{6}$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct VerifyPanelCodeBodyCode(::std::string::String);
    impl ::std::ops::Deref for VerifyPanelCodeBodyCode {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<VerifyPanelCodeBodyCode> for ::std::string::String {
        fn from(value: VerifyPanelCodeBodyCode) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&VerifyPanelCodeBodyCode> for VerifyPanelCodeBodyCode {
        fn from(value: &VerifyPanelCodeBodyCode) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for VerifyPanelCodeBodyCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^\\d{6}$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^\\d{6}$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for VerifyPanelCodeBodyCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for VerifyPanelCodeBodyCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for VerifyPanelCodeBodyCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for VerifyPanelCodeBodyCode {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`VerifyPanelCodeBodyMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct VerifyPanelCodeBodyMemberId(::std::string::String);
    impl ::std::ops::Deref for VerifyPanelCodeBodyMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<VerifyPanelCodeBodyMemberId> for ::std::string::String {
        fn from(value: VerifyPanelCodeBodyMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&VerifyPanelCodeBodyMemberId>
    for VerifyPanelCodeBodyMemberId {
        fn from(value: &VerifyPanelCodeBodyMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for VerifyPanelCodeBodyMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for VerifyPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for VerifyPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for VerifyPanelCodeBodyMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for VerifyPanelCodeBodyMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`VerifyPanelCodeResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "member"
    ///  ],
    ///  "properties": {
    ///    "member": {
    ///      "type": "object",
    ///      "required": [
    ///        "canRelease",
    ///        "memberId",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "canRelease": {
    ///          "type": "boolean"
    ///        },
    ///        "memberId": {
    ///          "type": "string",
    ///          "maxLength": 64,
    ///          "minLength": 16,
    ///          "pattern": "^[A-Za-z0-9_-]+$"
    ///        },
    ///        "name": {
    ///          "type": "string",
    ///          "maxLength": 120,
    ///          "minLength": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct VerifyPanelCodeResponse {
        pub member: VerifyPanelCodeResponseMember,
    }
    impl ::std::convert::From<&VerifyPanelCodeResponse> for VerifyPanelCodeResponse {
        fn from(value: &VerifyPanelCodeResponse) -> Self {
            value.clone()
        }
    }
    ///`VerifyPanelCodeResponseMember`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "canRelease",
    ///    "memberId",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "canRelease": {
    ///      "type": "boolean"
    ///    },
    ///    "memberId": {
    ///      "type": "string",
    ///      "maxLength": 64,
    ///      "minLength": 16,
    ///      "pattern": "^[A-Za-z0-9_-]+$"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 120,
    ///      "minLength": 1
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct VerifyPanelCodeResponseMember {
        #[serde(rename = "canRelease")]
        pub can_release: bool,
        #[serde(rename = "memberId")]
        pub member_id: VerifyPanelCodeResponseMemberMemberId,
        pub name: VerifyPanelCodeResponseMemberName,
    }
    impl ::std::convert::From<&VerifyPanelCodeResponseMember>
    for VerifyPanelCodeResponseMember {
        fn from(value: &VerifyPanelCodeResponseMember) -> Self {
            value.clone()
        }
    }
    ///`VerifyPanelCodeResponseMemberMemberId`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 64,
    ///  "minLength": 16,
    ///  "pattern": "^[A-Za-z0-9_-]+$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct VerifyPanelCodeResponseMemberMemberId(::std::string::String);
    impl ::std::ops::Deref for VerifyPanelCodeResponseMemberMemberId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<VerifyPanelCodeResponseMemberMemberId>
    for ::std::string::String {
        fn from(value: VerifyPanelCodeResponseMemberMemberId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&VerifyPanelCodeResponseMemberMemberId>
    for VerifyPanelCodeResponseMemberMemberId {
        fn from(value: &VerifyPanelCodeResponseMemberMemberId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for VerifyPanelCodeResponseMemberMemberId {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 64usize {
                return Err("longer than 64 characters".into());
            }
            if value.chars().count() < 16usize {
                return Err("shorter than 16 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^[A-Za-z0-9_-]+$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err("doesn't match pattern \"^[A-Za-z0-9_-]+$\"".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for VerifyPanelCodeResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for VerifyPanelCodeResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for VerifyPanelCodeResponseMemberMemberId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for VerifyPanelCodeResponseMemberMemberId {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
    ///`VerifyPanelCodeResponseMemberName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 120,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct VerifyPanelCodeResponseMemberName(::std::string::String);
    impl ::std::ops::Deref for VerifyPanelCodeResponseMemberName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<VerifyPanelCodeResponseMemberName>
    for ::std::string::String {
        fn from(value: VerifyPanelCodeResponseMemberName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&VerifyPanelCodeResponseMemberName>
    for VerifyPanelCodeResponseMemberName {
        fn from(value: &VerifyPanelCodeResponseMemberName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for VerifyPanelCodeResponseMemberName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 120usize {
                return Err("longer than 120 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for VerifyPanelCodeResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for VerifyPanelCodeResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for VerifyPanelCodeResponseMemberName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for VerifyPanelCodeResponseMemberName {
        fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
        where
            D: ::serde::Deserializer<'de>,
        {
            ::std::string::String::deserialize(deserializer)?
                .parse()
                .map_err(|e: self::error::ConversionError| {
                    <D::Error as ::serde::de::Error>::custom(e.to_string())
                })
        }
    }
}
#[derive(Clone, Debug)]
/**Client for codm-backend

Version: 1.0.0*/
pub struct Client {
    pub(crate) baseurl: String,
    pub(crate) client: reqwest::Client,
}
impl Client {
    /// Create a new client.
    ///
    /// `baseurl` is the base URL provided to the internal
    /// `reqwest::Client`, and should include a scheme and hostname,
    /// as well as port and a path stem if applicable.
    pub fn new(baseurl: &str) -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        let client = {
            let dur = std::time::Duration::from_secs(15);
            reqwest::ClientBuilder::new().connect_timeout(dur).timeout(dur)
        };
        #[cfg(target_arch = "wasm32")]
        let client = reqwest::ClientBuilder::new();
        Self::new_with_client(baseurl, client.build().unwrap())
    }
    /// Construct a new client with an existing `reqwest::Client`,
    /// allowing more control over its configuration.
    ///
    /// `baseurl` is the base URL provided to the internal
    /// `reqwest::Client`, and should include a scheme and hostname,
    /// as well as port and a path stem if applicable.
    pub fn new_with_client(baseurl: &str, client: reqwest::Client) -> Self {
        Self {
            baseurl: baseurl.to_string(),
            client,
        }
    }
    /// Get the base URL to which requests are made.
    pub fn baseurl(&self) -> &String {
        &self.baseurl
    }
    /// Get the internal `reqwest::Client` used to make requests.
    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }
    /// Get the version of this API.
    ///
    /// This string is pulled directly from the source OpenAPI
    /// document and may be in any format the API selects.
    pub fn api_version(&self) -> &'static str {
        "1.0.0"
    }
}
#[allow(clippy::all)]
#[allow(elided_named_lifetimes)]
impl Client {
    #[doc = "better-auth passthrough\n\nSends a `GET` request to `/auth/*`\n\n"]
    pub async fn auth_passthrough_get<'a>(
        &'a self,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/auth/*", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    #[doc = "better-auth passthrough\n\nSends a `POST` request to `/auth/*`\n\n"]
    pub async fn auth_passthrough_post<'a>(
        &'a self,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/auth/*", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Bridges a better-auth browser session into a one-time token, returned to the app over its loopback listener

Sends a `GET` request to `/desktop-callback`

*/
    pub async fn desktop_callback<'a>(
        &'a self,
        port: i64,
    ) -> Result<ResponseValue<::std::string::String>, Error<()>> {
        let url = format!("{}/desktop-callback", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .query(&progenitor_client::QueryParam::new("port", &port))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Readiness do daemon: banco, migrações e os timers de poll (canal WhatsApp entra só como diagnóstico)

Sends a `GET` request to `/health`

*/
    pub async fn health<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::HealthResponse>, Error<()>> {
        let url = format!("{}/health", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**MOCK. Accept-and-echo multipart avatar upload — returns new pictureUrl

Sends a `POST` request to `/identity/account/avatar`

*/
    pub async fn upload_avatar<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::UploadAvatarResponse>, Error<()>> {
        let url = format!("{}/identity/account/avatar", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Create a new owner (tenant); the creator becomes the responsible user

Sends a `POST` request to `/owners`

*/
    pub async fn create_owner<'a>(
        &'a self,
        body: &'a types::CreateOwnerBody,
    ) -> Result<ResponseValue<types::CreateOwnerResponse>, Error<()>> {
        let url = format!("{}/owners", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Disable a owner (C19 DisableOwner; OWNER only)

Sends a `POST` request to `/owners/disable`

*/
    pub async fn disable_owner<'a>(
        &'a self,
        body: &'a types::DisableOwnerBody,
    ) -> Result<ResponseValue<types::DisableOwnerResponse>, Error<()>> {
        let url = format!("{}/owners/disable", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Re-enable a previously disabled owner (C20 EnableOwner; OWNER only)

Sends a `POST` request to `/owners/enable`

*/
    pub async fn enable_owner<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::EnableOwnerResponse>, Error<()>> {
        let url = format!("{}/owners/enable", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Update owner profile settings (name / picture / timezone)

Sends a `PATCH` request to `/owners/settings`

*/
    pub async fn update_owner_settings<'a>(
        &'a self,
        body: &'a types::UpdateOwnerSettingsBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/owners/settings", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .patch(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Switch the authenticated session to the given owner (SPEC-07 SetActiveOwner)

Sends a `POST` request to `/owners/{ownerId}/activate`

*/
    pub async fn set_active_owner<'a>(
        &'a self,
        owner_id: &'a str,
    ) -> Result<ResponseValue<types::SetActiveOwnerResponse>, Error<()>> {
        let url = format!(
            "{}/owners/{}/activate", self.baseurl, encode_path(& owner_id.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**The per-group panel page (public HTML)

Sends a `GET` request to `/panel/g/{token}`

*/
    pub async fn panel_page<'a>(
        &'a self,
        token: &'a str,
    ) -> Result<ResponseValue<::std::string::String>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Ask, as the identified member, for an action on one of the group's issues (public, device cookie)

Sends a `POST` request to `/panel/g/{token}/actions`

*/
    pub async fn request_panel_action<'a>(
        &'a self,
        token: &'a str,
        body: &'a types::RequestPanelActionBody,
    ) -> Result<ResponseValue<types::RequestPanelActionResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/actions", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Where a panel action stands — pending, done, refused or expired (public, device cookie)

Sends a `GET` request to `/panel/g/{token}/actions/{actionId}`

*/
    pub async fn get_panel_action<'a>(
        &'a self,
        token: &'a str,
        action_id: &'a str,
    ) -> Result<ResponseValue<types::GetPanelActionResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/actions/{}", self.baseurl, encode_path(& token.to_string()),
            encode_path(& action_id.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**A group's issue board, by its panel link token (public)

Sends a `GET` request to `/panel/g/{token}/board`

*/
    pub async fn get_panel_board<'a>(
        &'a self,
        token: &'a str,
    ) -> Result<ResponseValue<types::GetPanelBoardResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/board", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**End this device's identity on a group's panel (public)

Sends a `POST` request to `/panel/g/{token}/forget`

*/
    pub async fn forget_panel_device<'a>(
        &'a self,
        token: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/forget", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Ask codm to send a panel identification code to a group member's WhatsApp (public)

Sends a `POST` request to `/panel/g/{token}/identify`

*/
    pub async fn request_panel_code<'a>(
        &'a self,
        token: &'a str,
        body: &'a types::RequestPanelCodeBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/identify", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**One issue of a group with its timeline, by the group's panel link token (public)

Sends a `GET` request to `/panel/g/{token}/issues/{issueId}`

*/
    pub async fn get_panel_issue<'a>(
        &'a self,
        token: &'a str,
        issue_id: &'a str,
    ) -> Result<ResponseValue<types::GetPanelIssueResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/issues/{}", self.baseurl, encode_path(& token.to_string()),
            encode_path(& issue_id.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Who this device is on a group's panel, from its device cookie (public)

Sends a `GET` request to `/panel/g/{token}/me`

*/
    pub async fn get_panel_identity<'a>(
        &'a self,
        token: &'a str,
    ) -> Result<ResponseValue<types::GetPanelIdentityResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/me", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**The people of a group (opaque id + name), by its panel link token (public)

Sends a `GET` request to `/panel/g/{token}/members`

*/
    pub async fn list_panel_members<'a>(
        &'a self,
        token: &'a str,
    ) -> Result<ResponseValue<types::ListPanelMembersResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/members", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Confirm a panel identification code; sets the device cookie (public)

Sends a `POST` request to `/panel/g/{token}/verify`

*/
    pub async fn verify_panel_code<'a>(
        &'a self,
        token: &'a str,
        body: &'a types::VerifyPanelCodeBody,
    ) -> Result<ResponseValue<types::VerifyPanelCodeResponse>, Error<()>> {
        let url = format!(
            "{}/panel/g/{}/verify", self.baseurl, encode_path(& token.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Replace a group's panel link token

Sends a `POST` request to `/panel/groups/{threadId}/rotate`

*/
    pub async fn rotate_panel_link<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::RotatePanelLinkResponse>, Error<()>> {
        let url = format!(
            "{}/panel/groups/{}/rotate", self.baseurl, encode_path(& thread_id
            .to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Replace each group's panel roster (opaque member ids) and pull the identification codes to deliver

Sends a `PUT` request to `/panel/roster`

*/
    pub async fn sync_panel_roster<'a>(
        &'a self,
        body: &'a types::SyncPanelRosterBody,
    ) -> Result<ResponseValue<types::SyncPanelRosterResponse>, Error<()>> {
        let url = format!("{}/panel/roster", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .put(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Upsert the daemon's panel snapshot (groups + changed issues) and return each group's link token

Sends a `PUT` request to `/panel/sync`

*/
    pub async fn sync_panel<'a>(
        &'a self,
        body: &'a types::SyncPanelBody,
    ) -> Result<ResponseValue<types::SyncPanelResponse>, Error<()>> {
        let url = format!("{}/panel/sync", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .put(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Get the current authenticated session

Sends a `GET` request to `/session`

*/
    pub async fn get_session<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetSessionResponse>, Error<()>> {
        let url = format!("{}/session", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Push a freshly-exchanged session token into the local daemon

Sends a `POST` request to `/session/cloud-token`

*/
    pub async fn set_cloud_token<'a>(
        &'a self,
        body: &'a types::SetCloudTokenBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/session/cloud-token", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .post(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Loopback landing (RFC 8252): receives the one-time sign-in code from the system browser

Sends a `GET` request to `/sign-in/loopback`

*/
    pub async fn sign_in_loopback<'a>(
        &'a self,
        code: &'a types::SignInLoopbackCode,
    ) -> Result<ResponseValue<::std::string::String>, Error<()>> {
        let url = format!("{}/sign-in/loopback", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .query(&progenitor_client::QueryParam::new("code", &code))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Claims the one-time sign-in code delivered to the loopback landing (single use)

Sends a `GET` request to `/sign-in/loopback/claim`

*/
    pub async fn claim_sign_in_code<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::ClaimSignInCodeResponse>, Error<()>> {
        let url = format!("{}/sign-in/loopback/claim", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Redireciona o browser do sistema para o provedor social escolhido, iniciando o login do desktop

Sends a `GET` request to `/sign-in/social`

*/
    pub async fn sign_in_social<'a>(
        &'a self,
        port: i64,
        provider: types::SocialProvider,
    ) -> Result<ResponseValue<::std::string::String>, Error<()>> {
        let url = format!("{}/sign-in/social", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self
            .client
            .get(url)
            .header(
                ::reqwest::header::ACCEPT,
                ::reqwest::header::HeaderValue::from_static("application/json"),
            )
            .query(&progenitor_client::QueryParam::new("port", &port))
            .query(&progenitor_client::QueryParam::new("provider", &provider))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
}
/// Items consumers will typically use such as the Client.
pub mod prelude {
    #[allow(unused_imports)]
    pub use super::Client;
}
