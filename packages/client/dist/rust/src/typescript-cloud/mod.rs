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
    ///    "AGENT_TOOLS_UNSUPPORTED",
    ///    "AGENT_TRANSPORT_STOP_NOT_DECLARABLE",
    ///    "ARTIFACT_FILE_MISSING",
    ///    "ARTIFACT_NOT_FOUND",
    ///    "ARTIFACT_NOT_PREVIEWABLE",
    ///    "ARTIFACT_TOO_LARGE",
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
    ///    "ISSUE_ARCHIVED",
    ///    "ISSUE_NOT_ARCHIVED",
    ///    "ISSUE_NOT_COMPLETED",
    ///    "ISSUE_NOT_FOUND",
    ///    "ISSUE_NOT_REOPENABLE",
    ///    "LAST_INVOKER",
    ///    "LOOP_NOT_FOUND",
    ///    "LOOP_PROMPT_TOO_LONG",
    ///    "LOOP_WITHOUT_WEEKDAY",
    ///    "MCP_APPROVAL_ALREADY_SETTLED",
    ///    "MCP_SERVER_KEY_CONFLICT",
    ///    "MCP_SERVER_NOT_FOUND",
    ///    "MCP_SERVER_TRANSPORT_INCOMPLETE",
    ///    "MCP_TOOL_APPROVAL_REQUIRED",
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
        #[serde(rename = "ISSUE_ARCHIVED")]
        IssueArchived,
        #[serde(rename = "ISSUE_NOT_ARCHIVED")]
        IssueNotArchived,
        #[serde(rename = "ISSUE_NOT_COMPLETED")]
        IssueNotCompleted,
        #[serde(rename = "ISSUE_NOT_FOUND")]
        IssueNotFound,
        #[serde(rename = "ISSUE_NOT_REOPENABLE")]
        IssueNotReopenable,
        #[serde(rename = "LAST_INVOKER")]
        LastInvoker,
        #[serde(rename = "LOOP_NOT_FOUND")]
        LoopNotFound,
        #[serde(rename = "LOOP_PROMPT_TOO_LONG")]
        LoopPromptTooLong,
        #[serde(rename = "LOOP_WITHOUT_WEEKDAY")]
        LoopWithoutWeekday,
        #[serde(rename = "MCP_APPROVAL_ALREADY_SETTLED")]
        McpApprovalAlreadySettled,
        #[serde(rename = "MCP_SERVER_KEY_CONFLICT")]
        McpServerKeyConflict,
        #[serde(rename = "MCP_SERVER_NOT_FOUND")]
        McpServerNotFound,
        #[serde(rename = "MCP_SERVER_TRANSPORT_INCOMPLETE")]
        McpServerTransportIncomplete,
        #[serde(rename = "MCP_TOOL_APPROVAL_REQUIRED")]
        McpToolApprovalRequired,
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
                Self::AgentToolsUnsupported => f.write_str("AGENT_TOOLS_UNSUPPORTED"),
                Self::AgentTransportStopNotDeclarable => {
                    f.write_str("AGENT_TRANSPORT_STOP_NOT_DECLARABLE")
                }
                Self::ArtifactFileMissing => f.write_str("ARTIFACT_FILE_MISSING"),
                Self::ArtifactNotFound => f.write_str("ARTIFACT_NOT_FOUND"),
                Self::ArtifactNotPreviewable => f.write_str("ARTIFACT_NOT_PREVIEWABLE"),
                Self::ArtifactTooLarge => f.write_str("ARTIFACT_TOO_LARGE"),
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
                Self::IssueArchived => f.write_str("ISSUE_ARCHIVED"),
                Self::IssueNotArchived => f.write_str("ISSUE_NOT_ARCHIVED"),
                Self::IssueNotCompleted => f.write_str("ISSUE_NOT_COMPLETED"),
                Self::IssueNotFound => f.write_str("ISSUE_NOT_FOUND"),
                Self::IssueNotReopenable => f.write_str("ISSUE_NOT_REOPENABLE"),
                Self::LastInvoker => f.write_str("LAST_INVOKER"),
                Self::LoopNotFound => f.write_str("LOOP_NOT_FOUND"),
                Self::LoopPromptTooLong => f.write_str("LOOP_PROMPT_TOO_LONG"),
                Self::LoopWithoutWeekday => f.write_str("LOOP_WITHOUT_WEEKDAY"),
                Self::McpApprovalAlreadySettled => {
                    f.write_str("MCP_APPROVAL_ALREADY_SETTLED")
                }
                Self::McpServerKeyConflict => f.write_str("MCP_SERVER_KEY_CONFLICT"),
                Self::McpServerNotFound => f.write_str("MCP_SERVER_NOT_FOUND"),
                Self::McpServerTransportIncomplete => {
                    f.write_str("MCP_SERVER_TRANSPORT_INCOMPLETE")
                }
                Self::McpToolApprovalRequired => {
                    f.write_str("MCP_TOOL_APPROVAL_REQUIRED")
                }
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
                "AGENT_TOOLS_UNSUPPORTED" => Ok(Self::AgentToolsUnsupported),
                "AGENT_TRANSPORT_STOP_NOT_DECLARABLE" => {
                    Ok(Self::AgentTransportStopNotDeclarable)
                }
                "ARTIFACT_FILE_MISSING" => Ok(Self::ArtifactFileMissing),
                "ARTIFACT_NOT_FOUND" => Ok(Self::ArtifactNotFound),
                "ARTIFACT_NOT_PREVIEWABLE" => Ok(Self::ArtifactNotPreviewable),
                "ARTIFACT_TOO_LARGE" => Ok(Self::ArtifactTooLarge),
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
                "ISSUE_ARCHIVED" => Ok(Self::IssueArchived),
                "ISSUE_NOT_ARCHIVED" => Ok(Self::IssueNotArchived),
                "ISSUE_NOT_COMPLETED" => Ok(Self::IssueNotCompleted),
                "ISSUE_NOT_FOUND" => Ok(Self::IssueNotFound),
                "ISSUE_NOT_REOPENABLE" => Ok(Self::IssueNotReopenable),
                "LAST_INVOKER" => Ok(Self::LastInvoker),
                "LOOP_NOT_FOUND" => Ok(Self::LoopNotFound),
                "LOOP_PROMPT_TOO_LONG" => Ok(Self::LoopPromptTooLong),
                "LOOP_WITHOUT_WEEKDAY" => Ok(Self::LoopWithoutWeekday),
                "MCP_APPROVAL_ALREADY_SETTLED" => Ok(Self::McpApprovalAlreadySettled),
                "MCP_SERVER_KEY_CONFLICT" => Ok(Self::McpServerKeyConflict),
                "MCP_SERVER_NOT_FOUND" => Ok(Self::McpServerNotFound),
                "MCP_SERVER_TRANSPORT_INCOMPLETE" => {
                    Ok(Self::McpServerTransportIncomplete)
                }
                "MCP_TOOL_APPROVAL_REQUIRED" => Ok(Self::McpToolApprovalRequired),
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
