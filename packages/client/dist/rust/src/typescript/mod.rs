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
    ///`AddWorkspaceBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "path"
    ///  ],
    ///  "properties": {
    ///    "path": {
    ///      "type": "string",
    ///      "maxLength": 1024,
    ///      "minLength": 1,
    ///      "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AddWorkspaceBody {
        pub path: AddWorkspaceBodyPath,
    }
    impl ::std::convert::From<&AddWorkspaceBody> for AddWorkspaceBody {
        fn from(value: &AddWorkspaceBody) -> Self {
            value.clone()
        }
    }
    ///`AddWorkspaceBodyPath`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 1024,
    ///  "minLength": 1,
    ///  "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AddWorkspaceBodyPath(::std::string::String);
    impl ::std::ops::Deref for AddWorkspaceBodyPath {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AddWorkspaceBodyPath> for ::std::string::String {
        fn from(value: AddWorkspaceBodyPath) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AddWorkspaceBodyPath> for AddWorkspaceBodyPath {
        fn from(value: &AddWorkspaceBodyPath) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AddWorkspaceBodyPath {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 1024usize {
                return Err("longer than 1024 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AddWorkspaceBodyPath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AddWorkspaceBodyPath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AddWorkspaceBodyPath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AddWorkspaceBodyPath {
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
    ///`AddWorkspaceResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "badges",
    ///    "workspaceId"
    ///  ],
    ///  "properties": {
    ///    "badges": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/WorkspaceBadge"
    ///      }
    ///    },
    ///    "workspaceId": {
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
    pub struct AddWorkspaceResponse {
        pub badges: ::std::vec::Vec<::codm_contracts_rust::wire::enums::WorkspaceBadge>,
        #[serde(rename = "workspaceId")]
        pub workspace_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&AddWorkspaceResponse> for AddWorkspaceResponse {
        fn from(value: &AddWorkspaceResponse) -> Self {
            value.clone()
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
    ///`AskOperatorBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "question"
    ///  ],
    ///  "properties": {
    ///    "question": {
    ///      "type": "string",
    ///      "maxLength": 4000,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AskOperatorBody {
        pub question: AskOperatorBodyQuestion,
    }
    impl ::std::convert::From<&AskOperatorBody> for AskOperatorBody {
        fn from(value: &AskOperatorBody) -> Self {
            value.clone()
        }
    }
    ///`AskOperatorBodyQuestion`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 4000,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct AskOperatorBodyQuestion(::std::string::String);
    impl ::std::ops::Deref for AskOperatorBodyQuestion {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AskOperatorBodyQuestion> for ::std::string::String {
        fn from(value: AskOperatorBodyQuestion) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AskOperatorBodyQuestion> for AskOperatorBodyQuestion {
        fn from(value: &AskOperatorBodyQuestion) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AskOperatorBodyQuestion {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 4000usize {
                return Err("longer than 4000 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for AskOperatorBodyQuestion {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for AskOperatorBodyQuestion {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for AskOperatorBodyQuestion {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AskOperatorBodyQuestion {
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
    ///`AskOperatorResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "delivered",
    ///    "stopId"
    ///  ],
    ///  "properties": {
    ///    "delivered": {
    ///      "type": "boolean",
    ///      "enum": [
    ///        true
    ///      ]
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
    pub struct AskOperatorResponse {
        pub delivered: bool,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&AskOperatorResponse> for AskOperatorResponse {
        fn from(value: &AskOperatorResponse) -> Self {
            value.clone()
        }
    }
    ///`AttachThreadBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "contactRef",
    ///    "providers",
    ///    "workspaceId"
    ///  ],
    ///  "properties": {
    ///    "contactRef": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "externalId": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "kind": {
    ///          "$ref": "#/components/schemas/ContactKind"
    ///        }
    ///      }
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      },
    ///      "minItems": 1
    ///    },
    ///    "workspaceId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AttachThreadBody {
        #[serde(rename = "contactRef")]
        pub contact_ref: AttachThreadBodyContactRef,
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        #[serde(rename = "workspaceId")]
        pub workspace_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&AttachThreadBody> for AttachThreadBody {
        fn from(value: &AttachThreadBody) -> Self {
            value.clone()
        }
    }
    ///`AttachThreadBodyContactRef`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "kind"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "externalId": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AttachThreadBodyContactRef {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: AttachThreadBodyContactRefDisplayName,
        #[serde(rename = "externalId")]
        pub external_id: AttachThreadBodyContactRefExternalId,
        pub kind: ::codm_contracts_rust::wire::enums::ContactKind,
    }
    impl ::std::convert::From<&AttachThreadBodyContactRef>
    for AttachThreadBodyContactRef {
        fn from(value: &AttachThreadBodyContactRef) -> Self {
            value.clone()
        }
    }
    ///`AttachThreadBodyContactRefDisplayName`
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
    pub struct AttachThreadBodyContactRefDisplayName(::std::string::String);
    impl ::std::ops::Deref for AttachThreadBodyContactRefDisplayName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AttachThreadBodyContactRefDisplayName>
    for ::std::string::String {
        fn from(value: AttachThreadBodyContactRefDisplayName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AttachThreadBodyContactRefDisplayName>
    for AttachThreadBodyContactRefDisplayName {
        fn from(value: &AttachThreadBodyContactRefDisplayName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AttachThreadBodyContactRefDisplayName {
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
    impl ::std::convert::TryFrom<&str> for AttachThreadBodyContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for AttachThreadBodyContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for AttachThreadBodyContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AttachThreadBodyContactRefDisplayName {
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
    ///`AttachThreadBodyContactRefExternalId`
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
    pub struct AttachThreadBodyContactRefExternalId(::std::string::String);
    impl ::std::ops::Deref for AttachThreadBodyContactRefExternalId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<AttachThreadBodyContactRefExternalId>
    for ::std::string::String {
        fn from(value: AttachThreadBodyContactRefExternalId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&AttachThreadBodyContactRefExternalId>
    for AttachThreadBodyContactRefExternalId {
        fn from(value: &AttachThreadBodyContactRefExternalId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for AttachThreadBodyContactRefExternalId {
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
    impl ::std::convert::TryFrom<&str> for AttachThreadBodyContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for AttachThreadBodyContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for AttachThreadBodyContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for AttachThreadBodyContactRefExternalId {
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
    ///`AttachThreadResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "threadId"
    ///  ],
    ///  "properties": {
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
    pub struct AttachThreadResponse {
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&AttachThreadResponse> for AttachThreadResponse {
        fn from(value: &AttachThreadResponse) -> Self {
            value.clone()
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
    ///`CompleteOnboardingResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "threadId": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
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
    pub struct CompleteOnboardingResponse {
        #[serde(rename = "threadId")]
        pub thread_id: ::std::option::Option<::uuid::Uuid>,
    }
    impl ::std::convert::From<&CompleteOnboardingResponse>
    for CompleteOnboardingResponse {
        fn from(value: &CompleteOnboardingResponse) -> Self {
            value.clone()
        }
    }
    ///`ConfigureContextBufferBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "bufferSize"
    ///  ],
    ///  "properties": {
    ///    "bufferSize": {
    ///      "$ref": "#/components/schemas/BufferSize"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureContextBufferBody {
        #[serde(rename = "bufferSize")]
        pub buffer_size: ::codm_contracts_rust::wire::enums::BufferSize,
    }
    impl ::std::convert::From<&ConfigureContextBufferBody>
    for ConfigureContextBufferBody {
        fn from(value: &ConfigureContextBufferBody) -> Self {
            value.clone()
        }
    }
    ///`ConfigureMentionGateBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "mentionGate"
    ///  ],
    ///  "properties": {
    ///    "mentionGate": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                false
    ///              ]
    ///            }
    ///          }
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled",
    ///            "tag"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                true
    ///              ]
    ///            },
    ///            "tag": {
    ///              "type": "string",
    ///              "minLength": 1
    ///            }
    ///          }
    ///        }
    ///      ]
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureMentionGateBody {
        #[serde(rename = "mentionGate")]
        pub mention_gate: ConfigureMentionGateBodyMentionGate,
    }
    impl ::std::convert::From<&ConfigureMentionGateBody> for ConfigureMentionGateBody {
        fn from(value: &ConfigureMentionGateBody) -> Self {
            value.clone()
        }
    }
    ///`ConfigureMentionGateBodyMentionGate`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            false
    ///          ]
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled",
    ///        "tag"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            true
    ///          ]
    ///        },
    ///        "tag": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        }
    ///      }
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum ConfigureMentionGateBodyMentionGate {
        Variant0 { enabled: bool },
        Variant1 { enabled: bool, tag: ConfigureMentionGateBodyMentionGateVariant1Tag },
    }
    impl ::std::convert::From<&Self> for ConfigureMentionGateBodyMentionGate {
        fn from(value: &ConfigureMentionGateBodyMentionGate) -> Self {
            value.clone()
        }
    }
    ///`ConfigureMentionGateBodyMentionGateVariant1Tag`
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
    pub struct ConfigureMentionGateBodyMentionGateVariant1Tag(::std::string::String);
    impl ::std::ops::Deref for ConfigureMentionGateBodyMentionGateVariant1Tag {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ConfigureMentionGateBodyMentionGateVariant1Tag>
    for ::std::string::String {
        fn from(value: ConfigureMentionGateBodyMentionGateVariant1Tag) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ConfigureMentionGateBodyMentionGateVariant1Tag>
    for ConfigureMentionGateBodyMentionGateVariant1Tag {
        fn from(value: &ConfigureMentionGateBodyMentionGateVariant1Tag) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ConfigureMentionGateBodyMentionGateVariant1Tag {
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
    impl ::std::convert::TryFrom<&str>
    for ConfigureMentionGateBodyMentionGateVariant1Tag {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for ConfigureMentionGateBodyMentionGateVariant1Tag {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for ConfigureMentionGateBodyMentionGateVariant1Tag {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for ConfigureMentionGateBodyMentionGateVariant1Tag {
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
    ///`ConfigureModelBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "model",
    ///    "provider"
    ///  ],
    ///  "properties": {
    ///    "model": {
    ///      "$ref": "#/components/schemas/AgentModelId"
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureModelBody {
        pub model: ::codm_contracts_rust::wire::enums::AgentModelId,
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
    }
    impl ::std::convert::From<&ConfigureModelBody> for ConfigureModelBody {
        fn from(value: &ConfigureModelBody) -> Self {
            value.clone()
        }
    }
    ///`ConfigurePromptBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "customPrompt": {
    ///      "type": "string",
    ///      "maxLength": 8000
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigurePromptBody {
        #[serde(
            rename = "customPrompt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub custom_prompt: ::std::option::Option<ConfigurePromptBodyCustomPrompt>,
    }
    impl ::std::convert::From<&ConfigurePromptBody> for ConfigurePromptBody {
        fn from(value: &ConfigurePromptBody) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for ConfigurePromptBody {
        fn default() -> Self {
            Self {
                custom_prompt: Default::default(),
            }
        }
    }
    ///`ConfigurePromptBodyCustomPrompt`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 8000
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct ConfigurePromptBodyCustomPrompt(::std::string::String);
    impl ::std::ops::Deref for ConfigurePromptBodyCustomPrompt {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ConfigurePromptBodyCustomPrompt>
    for ::std::string::String {
        fn from(value: ConfigurePromptBodyCustomPrompt) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ConfigurePromptBodyCustomPrompt>
    for ConfigurePromptBodyCustomPrompt {
        fn from(value: &ConfigurePromptBodyCustomPrompt) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ConfigurePromptBodyCustomPrompt {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 8000usize {
                return Err("longer than 8000 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for ConfigurePromptBodyCustomPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for ConfigurePromptBodyCustomPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for ConfigurePromptBodyCustomPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for ConfigurePromptBodyCustomPrompt {
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
    ///`ConfigureReactionsBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureReactionsBody {
        pub enabled: bool,
    }
    impl ::std::convert::From<&ConfigureReactionsBody> for ConfigureReactionsBody {
        fn from(value: &ConfigureReactionsBody) -> Self {
            value.clone()
        }
    }
    ///`ConfigureStreamingBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureStreamingBody {
        pub enabled: bool,
    }
    impl ::std::convert::From<&ConfigureStreamingBody> for ConfigureStreamingBody {
        fn from(value: &ConfigureStreamingBody) -> Self {
            value.clone()
        }
    }
    ///`ConfigureThinkingIndicatorBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConfigureThinkingIndicatorBody {
        pub enabled: bool,
    }
    impl ::std::convert::From<&ConfigureThinkingIndicatorBody>
    for ConfigureThinkingIndicatorBody {
        fn from(value: &ConfigureThinkingIndicatorBody) -> Self {
            value.clone()
        }
    }
    ///`CreateIssueBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "provider",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "title": {
    ///      "type": "string",
    ///      "maxLength": 200,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CreateIssueBody {
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
        pub title: CreateIssueBodyTitle,
    }
    impl ::std::convert::From<&CreateIssueBody> for CreateIssueBody {
        fn from(value: &CreateIssueBody) -> Self {
            value.clone()
        }
    }
    ///`CreateIssueBodyTitle`
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
    pub struct CreateIssueBodyTitle(::std::string::String);
    impl ::std::ops::Deref for CreateIssueBodyTitle {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<CreateIssueBodyTitle> for ::std::string::String {
        fn from(value: CreateIssueBodyTitle) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&CreateIssueBodyTitle> for CreateIssueBodyTitle {
        fn from(value: &CreateIssueBodyTitle) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for CreateIssueBodyTitle {
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
    impl ::std::convert::TryFrom<&str> for CreateIssueBodyTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for CreateIssueBodyTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for CreateIssueBodyTitle {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for CreateIssueBodyTitle {
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
    ///`CreateIssueResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "key"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "key": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct CreateIssueResponse {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
    }
    impl ::std::convert::From<&CreateIssueResponse> for CreateIssueResponse {
        fn from(value: &CreateIssueResponse) -> Self {
            value.clone()
        }
    }
    ///`CreateThreadLoopBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "prompt",
    ///    "schedule"
    ///  ],
    ///  "properties": {
    ///    "prompt": {
    ///      "type": "string",
    ///      "maxLength": 2000,
    ///      "minLength": 1
    ///    },
    ///    "schedule": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "kind",
    ///            "timeOfDay",
    ///            "timezone",
    ///            "weekdays"
    ///          ],
    ///          "properties": {
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "DAILY"
    ///              ]
    ///            },
    ///            "timeOfDay": {
    ///              "type": "string",
    ///              "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///            },
    ///            "timezone": {
    ///              "$ref": "#/components/schemas/Timezone"
    ///            },
    ///            "weekdays": {
    ///              "type": "array",
    ///              "items": {
    ///                "$ref": "#/components/schemas/DayOfWeek"
    ///              },
    ///              "minItems": 1
    ///            }
    ///          }
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "everyMinutes",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "everyMinutes": {
    ///              "type": "integer",
    ///              "maximum": 1440.0,
    ///              "minimum": 1.0
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "INTERVAL"
    ///              ]
    ///            }
    ///          }
    ///        }
    ///      ]
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CreateThreadLoopBody {
        pub prompt: CreateThreadLoopBodyPrompt,
        pub schedule: CreateThreadLoopBodySchedule,
    }
    impl ::std::convert::From<&CreateThreadLoopBody> for CreateThreadLoopBody {
        fn from(value: &CreateThreadLoopBody) -> Self {
            value.clone()
        }
    }
    ///`CreateThreadLoopBodyPrompt`
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
    pub struct CreateThreadLoopBodyPrompt(::std::string::String);
    impl ::std::ops::Deref for CreateThreadLoopBodyPrompt {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<CreateThreadLoopBodyPrompt> for ::std::string::String {
        fn from(value: CreateThreadLoopBodyPrompt) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&CreateThreadLoopBodyPrompt>
    for CreateThreadLoopBodyPrompt {
        fn from(value: &CreateThreadLoopBodyPrompt) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for CreateThreadLoopBodyPrompt {
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
    impl ::std::convert::TryFrom<&str> for CreateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for CreateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for CreateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for CreateThreadLoopBodyPrompt {
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
    ///`CreateThreadLoopBodySchedule`
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
    ///        "timeOfDay",
    ///        "timezone",
    ///        "weekdays"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DAILY"
    ///          ]
    ///        },
    ///        "timeOfDay": {
    ///          "type": "string",
    ///          "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///        },
    ///        "timezone": {
    ///          "$ref": "#/components/schemas/Timezone"
    ///        },
    ///        "weekdays": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/DayOfWeek"
    ///          },
    ///          "minItems": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "everyMinutes",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "everyMinutes": {
    ///          "type": "integer",
    ///          "maximum": 1440.0,
    ///          "minimum": 1.0
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "INTERVAL"
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
    pub enum CreateThreadLoopBodySchedule {
        #[serde(rename = "DAILY")]
        Daily {
            #[serde(rename = "timeOfDay")]
            time_of_day: CreateThreadLoopBodyScheduleTimeOfDay,
            timezone: ::codm_contracts_rust::wire::enums::Timezone,
            weekdays: ::std::vec::Vec<::codm_contracts_rust::wire::enums::DayOfWeek>,
        },
        #[serde(rename = "INTERVAL")]
        Interval {
            #[serde(rename = "everyMinutes")]
            every_minutes: ::std::num::NonZeroU64,
        },
    }
    impl ::std::convert::From<&Self> for CreateThreadLoopBodySchedule {
        fn from(value: &CreateThreadLoopBodySchedule) -> Self {
            value.clone()
        }
    }
    ///`CreateThreadLoopBodyScheduleTimeOfDay`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct CreateThreadLoopBodyScheduleTimeOfDay(::std::string::String);
    impl ::std::ops::Deref for CreateThreadLoopBodyScheduleTimeOfDay {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<CreateThreadLoopBodyScheduleTimeOfDay>
    for ::std::string::String {
        fn from(value: CreateThreadLoopBodyScheduleTimeOfDay) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&CreateThreadLoopBodyScheduleTimeOfDay>
    for CreateThreadLoopBodyScheduleTimeOfDay {
        fn from(value: &CreateThreadLoopBodyScheduleTimeOfDay) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for CreateThreadLoopBodyScheduleTimeOfDay {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^([01]\\d|2[0-3]):[0-5]\\d$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^([01]\\d|2[0-3]):[0-5]\\d$\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for CreateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for CreateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for CreateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for CreateThreadLoopBodyScheduleTimeOfDay {
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
    ///`CreateThreadLoopResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "loopId",
    ///    "nextRunAt"
    ///  ],
    ///  "properties": {
    ///    "loopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "nextRunAt": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct CreateThreadLoopResponse {
        #[serde(rename = "loopId")]
        pub loop_id: ::uuid::Uuid,
        #[serde(rename = "nextRunAt")]
        pub next_run_at: ::std::string::String,
    }
    impl ::std::convert::From<&CreateThreadLoopResponse> for CreateThreadLoopResponse {
        fn from(value: &CreateThreadLoopResponse) -> Self {
            value.clone()
        }
    }
    ///`DetectProvidersResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "providers"
    ///  ],
    ///  "properties": {
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "comingSoon",
    ///          "name",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "binaryPath": {
    ///            "type": "string"
    ///          },
    ///          "comingSoon": {
    ///            "type": "boolean"
    ///          },
    ///          "name": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ProviderStatus"
    ///          },
    ///          "version": {
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
    pub struct DetectProvidersResponse {
        pub providers: ::std::vec::Vec<DetectProvidersResponseProvidersItem>,
    }
    impl ::std::convert::From<&DetectProvidersResponse> for DetectProvidersResponse {
        fn from(value: &DetectProvidersResponse) -> Self {
            value.clone()
        }
    }
    ///`DetectProvidersResponseProvidersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "comingSoon",
    ///    "name",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "binaryPath": {
    ///      "type": "string"
    ///    },
    ///    "comingSoon": {
    ///      "type": "boolean"
    ///    },
    ///    "name": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ProviderStatus"
    ///    },
    ///    "version": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct DetectProvidersResponseProvidersItem {
        #[serde(
            rename = "binaryPath",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub binary_path: ::std::option::Option<::std::string::String>,
        #[serde(rename = "comingSoon")]
        pub coming_soon: bool,
        pub name: ::codm_contracts_rust::wire::enums::ProviderKind,
        pub status: ::codm_contracts_rust::wire::enums::ProviderStatus,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub version: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&DetectProvidersResponseProvidersItem>
    for DetectProvidersResponseProvidersItem {
        fn from(value: &DetectProvidersResponseProvidersItem) -> Self {
            value.clone()
        }
    }
    ///`ForkIssueBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "goal"
    ///  ],
    ///  "properties": {
    ///    "goal": {
    ///      "type": "string",
    ///      "maxLength": 2000,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ForkIssueBody {
        pub goal: ForkIssueBodyGoal,
    }
    impl ::std::convert::From<&ForkIssueBody> for ForkIssueBody {
        fn from(value: &ForkIssueBody) -> Self {
            value.clone()
        }
    }
    ///`ForkIssueBodyGoal`
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
    pub struct ForkIssueBodyGoal(::std::string::String);
    impl ::std::ops::Deref for ForkIssueBodyGoal {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ForkIssueBodyGoal> for ::std::string::String {
        fn from(value: ForkIssueBodyGoal) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ForkIssueBodyGoal> for ForkIssueBodyGoal {
        fn from(value: &ForkIssueBodyGoal) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ForkIssueBodyGoal {
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
    impl ::std::convert::TryFrom<&str> for ForkIssueBodyGoal {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ForkIssueBodyGoal {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ForkIssueBodyGoal {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for ForkIssueBodyGoal {
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
    ///`ForkIssueResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "key"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "key": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ForkIssueResponse {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
    }
    impl ::std::convert::From<&ForkIssueResponse> for ForkIssueResponse {
        fn from(value: &ForkIssueResponse) -> Self {
            value.clone()
        }
    }
    ///`GetAttachThreadWizardResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channels",
    ///    "contacts",
    ///    "contactsNextCursor",
    ///    "noChannelConnected",
    ///    "providers",
    ///    "workspaces"
    ///  ],
    ///  "properties": {
    ///    "channels": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "channelId",
    ///          "kind"
    ///        ],
    ///        "properties": {
    ///          "channelId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/ChannelKind"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "contacts": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "alreadyAttached",
    ///          "channelId",
    ///          "displayName",
    ///          "externalId",
    ///          "hasAvatar",
    ///          "kind",
    ///          "lastMessageAt",
    ///          "participantCount"
    ///        ],
    ///        "properties": {
    ///          "alreadyAttached": {
    ///            "type": "boolean"
    ///          },
    ///          "channelId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "displayName": {
    ///            "type": "string"
    ///          },
    ///          "externalId": {
    ///            "type": "string"
    ///          },
    ///          "hasAvatar": {
    ///            "type": "boolean"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/ContactKind"
    ///          },
    ///          "lastMessageAt": {
    ///            "type": [
    ///              "string",
    ///              "null"
    ///            ]
    ///          },
    ///          "participantCount": {
    ///            "type": [
    ///              "integer",
    ///              "null"
    ///            ],
    ///            "maximum": 9007199254740991.0,
    ///            "minimum": -9007199254740991.0
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "contactsNextCursor": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "noChannelConnected": {
    ///      "type": "boolean"
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "available",
    ///          "comingSoon",
    ///          "provider",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "available": {
    ///            "type": "boolean"
    ///          },
    ///          "comingSoon": {
    ///            "type": "boolean"
    ///          },
    ///          "provider": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ProviderStatus"
    ///          },
    ///          "version": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "workspaces": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "badges",
    ///          "path",
    ///          "workspaceId"
    ///        ],
    ///        "properties": {
    ///          "badges": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/WorkspaceBadge"
    ///            }
    ///          },
    ///          "path": {
    ///            "type": "string"
    ///          },
    ///          "workspaceId": {
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
    pub struct GetAttachThreadWizardResponse {
        pub channels: ::std::vec::Vec<GetAttachThreadWizardResponseChannelsItem>,
        pub contacts: ::std::vec::Vec<GetAttachThreadWizardResponseContactsItem>,
        #[serde(rename = "contactsNextCursor")]
        pub contacts_next_cursor: ::std::option::Option<::std::string::String>,
        #[serde(rename = "noChannelConnected")]
        pub no_channel_connected: bool,
        pub providers: ::std::vec::Vec<GetAttachThreadWizardResponseProvidersItem>,
        pub workspaces: ::std::vec::Vec<GetAttachThreadWizardResponseWorkspacesItem>,
    }
    impl ::std::convert::From<&GetAttachThreadWizardResponse>
    for GetAttachThreadWizardResponse {
        fn from(value: &GetAttachThreadWizardResponse) -> Self {
            value.clone()
        }
    }
    ///`GetAttachThreadWizardResponseChannelsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "kind"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetAttachThreadWizardResponseChannelsItem {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        pub kind: ::codm_contracts_rust::wire::enums::ChannelKind,
    }
    impl ::std::convert::From<&GetAttachThreadWizardResponseChannelsItem>
    for GetAttachThreadWizardResponseChannelsItem {
        fn from(value: &GetAttachThreadWizardResponseChannelsItem) -> Self {
            value.clone()
        }
    }
    ///`GetAttachThreadWizardResponseContactsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "alreadyAttached",
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar",
    ///    "kind",
    ///    "lastMessageAt",
    ///    "participantCount"
    ///  ],
    ///  "properties": {
    ///    "alreadyAttached": {
    ///      "type": "boolean"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    },
    ///    "lastMessageAt": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "participantCount": {
    ///      "type": [
    ///        "integer",
    ///        "null"
    ///      ],
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetAttachThreadWizardResponseContactsItem {
        #[serde(rename = "alreadyAttached")]
        pub already_attached: bool,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
        pub kind: ::codm_contracts_rust::wire::enums::ContactKind,
        #[serde(rename = "lastMessageAt")]
        pub last_message_at: ::std::option::Option<::std::string::String>,
        #[serde(rename = "participantCount")]
        pub participant_count: ::std::option::Option<i64>,
    }
    impl ::std::convert::From<&GetAttachThreadWizardResponseContactsItem>
    for GetAttachThreadWizardResponseContactsItem {
        fn from(value: &GetAttachThreadWizardResponseContactsItem) -> Self {
            value.clone()
        }
    }
    ///`GetAttachThreadWizardResponseProvidersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "available",
    ///    "comingSoon",
    ///    "provider",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "available": {
    ///      "type": "boolean"
    ///    },
    ///    "comingSoon": {
    ///      "type": "boolean"
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ProviderStatus"
    ///    },
    ///    "version": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetAttachThreadWizardResponseProvidersItem {
        pub available: bool,
        #[serde(rename = "comingSoon")]
        pub coming_soon: bool,
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
        pub status: ::codm_contracts_rust::wire::enums::ProviderStatus,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub version: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&GetAttachThreadWizardResponseProvidersItem>
    for GetAttachThreadWizardResponseProvidersItem {
        fn from(value: &GetAttachThreadWizardResponseProvidersItem) -> Self {
            value.clone()
        }
    }
    ///`GetAttachThreadWizardResponseWorkspacesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "badges",
    ///    "path",
    ///    "workspaceId"
    ///  ],
    ///  "properties": {
    ///    "badges": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/WorkspaceBadge"
    ///      }
    ///    },
    ///    "path": {
    ///      "type": "string"
    ///    },
    ///    "workspaceId": {
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
    pub struct GetAttachThreadWizardResponseWorkspacesItem {
        pub badges: ::std::vec::Vec<::codm_contracts_rust::wire::enums::WorkspaceBadge>,
        pub path: ::std::string::String,
        #[serde(rename = "workspaceId")]
        pub workspace_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetAttachThreadWizardResponseWorkspacesItem>
    for GetAttachThreadWizardResponseWorkspacesItem {
        fn from(value: &GetAttachThreadWizardResponseWorkspacesItem) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "activeSessions",
    ///    "agentsRunningNow",
    ///    "channels",
    ///    "latestActivity",
    ///    "threads",
    ///    "today"
    ///  ],
    ///  "properties": {
    ///    "activeSessions": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "channelId",
    ///          "channelKind",
    ///          "displayName",
    ///          "externalId",
    ///          "hasAvatar",
    ///          "lastActivity",
    ///          "providers",
    ///          "status",
    ///          "threadId",
    ///          "workspacePath"
    ///        ],
    ///        "properties": {
    ///          "channelId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "channelKind": {
    ///            "$ref": "#/components/schemas/ChannelKind"
    ///          },
    ///          "displayName": {
    ///            "type": "string"
    ///          },
    ///          "externalId": {
    ///            "type": "string"
    ///          },
    ///          "hasAvatar": {
    ///            "type": "boolean"
    ///          },
    ///          "lastActivity": {
    ///            "type": "string"
    ///          },
    ///          "providers": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/ProviderKind"
    ///            }
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ThreadStatus"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "workspacePath": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "agentsRunningNow": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "channels": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "kind",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "kind": {
    ///            "$ref": "#/components/schemas/ChannelKind"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ChannelStatus"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "latestActivity": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "at",
    ///          "kind",
    ///          "subtitle",
    ///          "threadId"
    ///        ],
    ///        "properties": {
    ///          "at": {
    ///            "type": "string"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/TranscriptKind"
    ///          },
    ///          "sender": {
    ///            "type": "object",
    ///            "required": [
    ///              "channelId",
    ///              "displayName",
    ///              "externalId",
    ///              "hasAvatar"
    ///            ],
    ///            "properties": {
    ///              "channelId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "displayName": {
    ///                "type": "string"
    ///              },
    ///              "externalId": {
    ///                "type": "string"
    ///              },
    ///              "hasAvatar": {
    ///                "type": "boolean"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          "subtitle": {
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
    ///    "mentionCta": {
    ///      "type": "object",
    ///      "required": [
    ///        "tag",
    ///        "threadId"
    ///      ],
    ///      "properties": {
    ///        "tag": {
    ///          "type": "string"
    ///        },
    ///        "threadId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "needsYou": {
    ///      "type": "object",
    ///      "required": [
    ///        "stopKinds",
    ///        "threadDisplayName",
    ///        "threadId"
    ///      ],
    ///      "properties": {
    ///        "stopKinds": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          }
    ///        },
    ///        "threadDisplayName": {
    ///          "type": "string"
    ///        },
    ///        "threadId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "threads": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "channelId",
    ///          "channelKind",
    ///          "displayName",
    ///          "externalId",
    ///          "hasAvatar",
    ///          "lastActivity",
    ///          "providers",
    ///          "status",
    ///          "threadId",
    ///          "workspacePath"
    ///        ],
    ///        "properties": {
    ///          "channelId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "channelKind": {
    ///            "$ref": "#/components/schemas/ChannelKind"
    ///          },
    ///          "displayName": {
    ///            "type": "string"
    ///          },
    ///          "externalId": {
    ///            "type": "string"
    ///          },
    ///          "hasAvatar": {
    ///            "type": "boolean"
    ///          },
    ///          "lastActivity": {
    ///            "type": "string"
    ///          },
    ///          "providers": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/ProviderKind"
    ///            }
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ThreadStatus"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "workspacePath": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "today": {
    ///      "type": "object",
    ///      "required": [
    ///        "issuesClosed",
    ///        "issuesOpened",
    ///        "medianResponseSeconds"
    ///      ],
    ///      "properties": {
    ///        "issuesClosed": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "issuesOpened": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "medianResponseSeconds": {
    ///          "type": "number"
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
    pub struct GetHomeDashboardResponse {
        #[serde(rename = "activeSessions")]
        pub active_sessions: ::std::vec::Vec<GetHomeDashboardResponseActiveSessionsItem>,
        #[serde(rename = "agentsRunningNow")]
        pub agents_running_now: i64,
        pub channels: ::std::vec::Vec<GetHomeDashboardResponseChannelsItem>,
        #[serde(rename = "latestActivity")]
        pub latest_activity: ::std::vec::Vec<GetHomeDashboardResponseLatestActivityItem>,
        #[serde(
            rename = "mentionCta",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub mention_cta: ::std::option::Option<GetHomeDashboardResponseMentionCta>,
        #[serde(
            rename = "needsYou",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub needs_you: ::std::option::Option<GetHomeDashboardResponseNeedsYou>,
        pub threads: ::std::vec::Vec<GetHomeDashboardResponseThreadsItem>,
        pub today: GetHomeDashboardResponseToday,
    }
    impl ::std::convert::From<&GetHomeDashboardResponse> for GetHomeDashboardResponse {
        fn from(value: &GetHomeDashboardResponse) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseActiveSessionsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "channelKind",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar",
    ///    "lastActivity",
    ///    "providers",
    ///    "status",
    ///    "threadId",
    ///    "workspacePath"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "channelKind": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    },
    ///    "lastActivity": {
    ///      "type": "string"
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ThreadStatus"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "workspacePath": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetHomeDashboardResponseActiveSessionsItem {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "channelKind")]
        pub channel_kind: ::codm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
        #[serde(rename = "lastActivity")]
        pub last_activity: ::std::string::String,
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        pub status: ::codm_contracts_rust::wire::enums::ThreadStatus,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        #[serde(rename = "workspacePath")]
        pub workspace_path: ::std::string::String,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseActiveSessionsItem>
    for GetHomeDashboardResponseActiveSessionsItem {
        fn from(value: &GetHomeDashboardResponseActiveSessionsItem) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseChannelsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "kind",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ChannelStatus"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetHomeDashboardResponseChannelsItem {
        pub kind: ::codm_contracts_rust::wire::enums::ChannelKind,
        pub status: ::codm_contracts_rust::wire::enums::ChannelStatus,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseChannelsItem>
    for GetHomeDashboardResponseChannelsItem {
        fn from(value: &GetHomeDashboardResponseChannelsItem) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseLatestActivityItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "kind",
    ///    "subtitle",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/TranscriptKind"
    ///    },
    ///    "sender": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "hasAvatar"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string"
    ///        },
    ///        "externalId": {
    ///          "type": "string"
    ///        },
    ///        "hasAvatar": {
    ///          "type": "boolean"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "subtitle": {
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
    pub struct GetHomeDashboardResponseLatestActivityItem {
        pub at: ::std::string::String,
        pub kind: ::codm_contracts_rust::wire::enums::TranscriptKind,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub sender: ::std::option::Option<
            GetHomeDashboardResponseLatestActivityItemSender,
        >,
        pub subtitle: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseLatestActivityItem>
    for GetHomeDashboardResponseLatestActivityItem {
        fn from(value: &GetHomeDashboardResponseLatestActivityItem) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseLatestActivityItemSender`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetHomeDashboardResponseLatestActivityItemSender {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseLatestActivityItemSender>
    for GetHomeDashboardResponseLatestActivityItemSender {
        fn from(value: &GetHomeDashboardResponseLatestActivityItemSender) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseMentionCta`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "tag",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "tag": {
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
    pub struct GetHomeDashboardResponseMentionCta {
        pub tag: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseMentionCta>
    for GetHomeDashboardResponseMentionCta {
        fn from(value: &GetHomeDashboardResponseMentionCta) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseNeedsYou`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "stopKinds",
    ///    "threadDisplayName",
    ///    "threadId"
    ///  ],
    ///  "properties": {
    ///    "stopKinds": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/StopKind"
    ///      }
    ///    },
    ///    "threadDisplayName": {
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
    pub struct GetHomeDashboardResponseNeedsYou {
        #[serde(rename = "stopKinds")]
        pub stop_kinds: ::std::vec::Vec<::codm_contracts_rust::wire::enums::StopKind>,
        #[serde(rename = "threadDisplayName")]
        pub thread_display_name: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseNeedsYou>
    for GetHomeDashboardResponseNeedsYou {
        fn from(value: &GetHomeDashboardResponseNeedsYou) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseThreadsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "channelKind",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar",
    ///    "lastActivity",
    ///    "providers",
    ///    "status",
    ///    "threadId",
    ///    "workspacePath"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "channelKind": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    },
    ///    "lastActivity": {
    ///      "type": "string"
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ThreadStatus"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "workspacePath": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetHomeDashboardResponseThreadsItem {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "channelKind")]
        pub channel_kind: ::codm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
        #[serde(rename = "lastActivity")]
        pub last_activity: ::std::string::String,
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        pub status: ::codm_contracts_rust::wire::enums::ThreadStatus,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        #[serde(rename = "workspacePath")]
        pub workspace_path: ::std::string::String,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseThreadsItem>
    for GetHomeDashboardResponseThreadsItem {
        fn from(value: &GetHomeDashboardResponseThreadsItem) -> Self {
            value.clone()
        }
    }
    ///`GetHomeDashboardResponseToday`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issuesClosed",
    ///    "issuesOpened",
    ///    "medianResponseSeconds"
    ///  ],
    ///  "properties": {
    ///    "issuesClosed": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "issuesOpened": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "medianResponseSeconds": {
    ///      "type": "number"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetHomeDashboardResponseToday {
        #[serde(rename = "issuesClosed")]
        pub issues_closed: i64,
        #[serde(rename = "issuesOpened")]
        pub issues_opened: i64,
        #[serde(rename = "medianResponseSeconds")]
        pub median_response_seconds: f64,
    }
    impl ::std::convert::From<&GetHomeDashboardResponseToday>
    for GetHomeDashboardResponseToday {
        fn from(value: &GetHomeDashboardResponseToday) -> Self {
            value.clone()
        }
    }
    ///`GetIssueDetailResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issue",
    ///    "provider",
    ///    "routedMessages",
    ///    "stops",
    ///    "terminalLog"
    ///  ],
    ///  "properties": {
    ///    "issue": {
    ///      "type": "object",
    ///      "required": [
    ///        "archived",
    ///        "issueId",
    ///        "key",
    ///        "status",
    ///        "title"
    ///      ],
    ///      "properties": {
    ///        "archived": {
    ///          "type": "boolean"
    ///        },
    ///        "issueId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "key": {
    ///          "type": "string"
    ///        },
    ///        "meta": {
    ///          "type": "string"
    ///        },
    ///        "status": {
    ///          "$ref": "#/components/schemas/IssueStatus"
    ///        },
    ///        "title": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "routedMessages": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "at",
    ///          "entryId",
    ///          "kind",
    ///          "text"
    ///        ],
    ///        "properties": {
    ///          "at": {
    ///            "type": "string"
    ///          },
    ///          "classification": {
    ///            "$ref": "#/components/schemas/ClassificationMethod"
    ///          },
    ///          "entryId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/TranscriptKind"
    ///          },
    ///          "text": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "stops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "detail",
    ///          "kind",
    ///          "raisedAt",
    ///          "stopId",
    ///          "title"
    ///        ],
    ///        "properties": {
    ///          "detail": {
    ///            "type": "string"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          },
    ///          "raisedAt": {
    ///            "type": "string"
    ///          },
    ///          "stopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "terminalLog": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "at",
    ///          "line"
    ///        ],
    ///        "properties": {
    ///          "at": {
    ///            "type": "string"
    ///          },
    ///          "line": {
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
    pub struct GetIssueDetailResponse {
        pub issue: GetIssueDetailResponseIssue,
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
        #[serde(rename = "routedMessages")]
        pub routed_messages: ::std::vec::Vec<GetIssueDetailResponseRoutedMessagesItem>,
        pub stops: ::std::vec::Vec<GetIssueDetailResponseStopsItem>,
        #[serde(rename = "terminalLog")]
        pub terminal_log: ::std::vec::Vec<GetIssueDetailResponseTerminalLogItem>,
    }
    impl ::std::convert::From<&GetIssueDetailResponse> for GetIssueDetailResponse {
        fn from(value: &GetIssueDetailResponse) -> Self {
            value.clone()
        }
    }
    ///`GetIssueDetailResponseIssue`
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
    ///    "status",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssueDetailResponseIssue {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub meta: ::std::option::Option<::std::string::String>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssueDetailResponseIssue>
    for GetIssueDetailResponseIssue {
        fn from(value: &GetIssueDetailResponseIssue) -> Self {
            value.clone()
        }
    }
    ///`GetIssueDetailResponseRoutedMessagesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "entryId",
    ///    "kind",
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string"
    ///    },
    ///    "classification": {
    ///      "$ref": "#/components/schemas/ClassificationMethod"
    ///    },
    ///    "entryId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/TranscriptKind"
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssueDetailResponseRoutedMessagesItem {
        pub at: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub classification: ::std::option::Option<
            ::codm_contracts_rust::wire::enums::ClassificationMethod,
        >,
        #[serde(rename = "entryId")]
        pub entry_id: ::uuid::Uuid,
        pub kind: ::codm_contracts_rust::wire::enums::TranscriptKind,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssueDetailResponseRoutedMessagesItem>
    for GetIssueDetailResponseRoutedMessagesItem {
        fn from(value: &GetIssueDetailResponseRoutedMessagesItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssueDetailResponseStopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "detail",
    ///    "kind",
    ///    "raisedAt",
    ///    "stopId",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "detail": {
    ///      "type": "string"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    },
    ///    "raisedAt": {
    ///      "type": "string"
    ///    },
    ///    "stopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssueDetailResponseStopsItem {
        pub detail: ::std::string::String,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
        #[serde(rename = "raisedAt")]
        pub raised_at: ::std::string::String,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssueDetailResponseStopsItem>
    for GetIssueDetailResponseStopsItem {
        fn from(value: &GetIssueDetailResponseStopsItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssueDetailResponseTerminalLogItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "line"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string"
    ///    },
    ///    "line": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssueDetailResponseTerminalLogItem {
        pub at: ::std::string::String,
        pub line: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssueDetailResponseTerminalLogItem>
    for GetIssueDetailResponseTerminalLogItem {
        fn from(value: &GetIssueDetailResponseTerminalLogItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssueStatusResponse`
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
    ///    "status",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssueStatusResponse {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssueStatusResponse> for GetIssueStatusResponse {
        fn from(value: &GetIssueStatusResponse) -> Self {
            value.clone()
        }
    }
    ///`GetIssuesOverviewResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "archived",
    ///    "groups",
    ///    "statsLine"
    ///  ],
    ///  "properties": {
    ///    "archived": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "archived",
    ///          "issueId",
    ///          "key",
    ///          "status",
    ///          "threadDisplayName",
    ///          "threadId",
    ///          "title"
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
    ///            "type": "string"
    ///          },
    ///          "meta": {
    ///            "type": "string"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "threadDisplayName": {
    ///            "type": "string"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "groups": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "items",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "items": {
    ///            "type": "array",
    ///            "items": {
    ///              "type": "object",
    ///              "required": [
    ///                "archived",
    ///                "issueId",
    ///                "key",
    ///                "status",
    ///                "threadDisplayName",
    ///                "threadId",
    ///                "title"
    ///              ],
    ///              "properties": {
    ///                "archived": {
    ///                  "type": "boolean"
    ///                },
    ///                "issueId": {
    ///                  "type": "string",
    ///                  "format": "uuid",
    ///                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                },
    ///                "key": {
    ///                  "type": "string"
    ///                },
    ///                "meta": {
    ///                  "type": "string"
    ///                },
    ///                "status": {
    ///                  "$ref": "#/components/schemas/IssueStatus"
    ///                },
    ///                "threadDisplayName": {
    ///                  "type": "string"
    ///                },
    ///                "threadId": {
    ///                  "type": "string",
    ///                  "format": "uuid",
    ///                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                },
    ///                "title": {
    ///                  "type": "string"
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            }
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "statsLine": {
    ///      "type": "object",
    ///      "required": [
    ///        "archived",
    ///        "awaitingInput",
    ///        "completed",
    ///        "working"
    ///      ],
    ///      "properties": {
    ///        "archived": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "awaitingInput": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "completed": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "working": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
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
    pub struct GetIssuesOverviewResponse {
        pub archived: ::std::vec::Vec<GetIssuesOverviewResponseArchivedItem>,
        pub groups: ::std::vec::Vec<GetIssuesOverviewResponseGroupsItem>,
        #[serde(rename = "statsLine")]
        pub stats_line: GetIssuesOverviewResponseStatsLine,
    }
    impl ::std::convert::From<&GetIssuesOverviewResponse> for GetIssuesOverviewResponse {
        fn from(value: &GetIssuesOverviewResponse) -> Self {
            value.clone()
        }
    }
    ///`GetIssuesOverviewResponseArchivedItem`
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
    ///    "status",
    ///    "threadDisplayName",
    ///    "threadId",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "threadDisplayName": {
    ///      "type": "string"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssuesOverviewResponseArchivedItem {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub meta: ::std::option::Option<::std::string::String>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        #[serde(rename = "threadDisplayName")]
        pub thread_display_name: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssuesOverviewResponseArchivedItem>
    for GetIssuesOverviewResponseArchivedItem {
        fn from(value: &GetIssuesOverviewResponseArchivedItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssuesOverviewResponseGroupsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "items",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "items": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "archived",
    ///          "issueId",
    ///          "key",
    ///          "status",
    ///          "threadDisplayName",
    ///          "threadId",
    ///          "title"
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
    ///            "type": "string"
    ///          },
    ///          "meta": {
    ///            "type": "string"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "threadDisplayName": {
    ///            "type": "string"
    ///          },
    ///          "threadId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssuesOverviewResponseGroupsItem {
        pub items: ::std::vec::Vec<GetIssuesOverviewResponseGroupsItemItemsItem>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
    }
    impl ::std::convert::From<&GetIssuesOverviewResponseGroupsItem>
    for GetIssuesOverviewResponseGroupsItem {
        fn from(value: &GetIssuesOverviewResponseGroupsItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssuesOverviewResponseGroupsItemItemsItem`
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
    ///    "status",
    ///    "threadDisplayName",
    ///    "threadId",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "threadDisplayName": {
    ///      "type": "string"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssuesOverviewResponseGroupsItemItemsItem {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub meta: ::std::option::Option<::std::string::String>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        #[serde(rename = "threadDisplayName")]
        pub thread_display_name: ::std::string::String,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetIssuesOverviewResponseGroupsItemItemsItem>
    for GetIssuesOverviewResponseGroupsItemItemsItem {
        fn from(value: &GetIssuesOverviewResponseGroupsItemItemsItem) -> Self {
            value.clone()
        }
    }
    ///`GetIssuesOverviewResponseStatsLine`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "archived",
    ///    "awaitingInput",
    ///    "completed",
    ///    "working"
    ///  ],
    ///  "properties": {
    ///    "archived": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "awaitingInput": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "completed": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "working": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetIssuesOverviewResponseStatsLine {
        pub archived: i64,
        #[serde(rename = "awaitingInput")]
        pub awaiting_input: i64,
        pub completed: i64,
        pub working: i64,
    }
    impl ::std::convert::From<&GetIssuesOverviewResponseStatsLine>
    for GetIssuesOverviewResponseStatsLine {
        fn from(value: &GetIssuesOverviewResponseStatsLine) -> Self {
            value.clone()
        }
    }
    ///`GetMyAccountResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "preferences",
    ///    "profile",
    ///    "security"
    ///  ],
    ///  "properties": {
    ///    "preferences": {
    ///      "type": "object",
    ///      "required": [
    ///        "currency",
    ///        "language",
    ///        "timezone"
    ///      ],
    ///      "properties": {
    ///        "currency": {
    ///          "$ref": "#/components/schemas/CurrencyCode"
    ///        },
    ///        "language": {
    ///          "$ref": "#/components/schemas/Language"
    ///        },
    ///        "timezone": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "profile": {
    ///      "type": "object",
    ///      "required": [
    ///        "company",
    ///        "email",
    ///        "name",
    ///        "pictureUrl",
    ///        "userId"
    ///      ],
    ///      "properties": {
    ///        "company": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ]
    ///        },
    ///        "email": {
    ///          "type": "string"
    ///        },
    ///        "name": {
    ///          "type": "string"
    ///        },
    ///        "pictureUrl": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ],
    ///          "format": "uri"
    ///        },
    ///        "userId": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "security": {
    ///      "type": "object",
    ///      "required": [
    ///        "hasPassword",
    ///        "lastPasswordChangeAt",
    ///        "twoFactorEnabled"
    ///      ],
    ///      "properties": {
    ///        "hasPassword": {
    ///          "type": "boolean"
    ///        },
    ///        "lastPasswordChangeAt": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ],
    ///          "format": "date-time",
    ///          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    ///        },
    ///        "twoFactorEnabled": {
    ///          "type": "boolean"
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
    pub struct GetMyAccountResponse {
        pub preferences: GetMyAccountResponsePreferences,
        pub profile: GetMyAccountResponseProfile,
        pub security: GetMyAccountResponseSecurity,
    }
    impl ::std::convert::From<&GetMyAccountResponse> for GetMyAccountResponse {
        fn from(value: &GetMyAccountResponse) -> Self {
            value.clone()
        }
    }
    ///`GetMyAccountResponsePreferences`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "currency",
    ///    "language",
    ///    "timezone"
    ///  ],
    ///  "properties": {
    ///    "currency": {
    ///      "$ref": "#/components/schemas/CurrencyCode"
    ///    },
    ///    "language": {
    ///      "$ref": "#/components/schemas/Language"
    ///    },
    ///    "timezone": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetMyAccountResponsePreferences {
        pub currency: ::codm_contracts_rust::wire::enums::CurrencyCode,
        pub language: ::codm_contracts_rust::wire::enums::Language,
        pub timezone: ::std::string::String,
    }
    impl ::std::convert::From<&GetMyAccountResponsePreferences>
    for GetMyAccountResponsePreferences {
        fn from(value: &GetMyAccountResponsePreferences) -> Self {
            value.clone()
        }
    }
    ///`GetMyAccountResponseProfile`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "company",
    ///    "email",
    ///    "name",
    ///    "pictureUrl",
    ///    "userId"
    ///  ],
    ///  "properties": {
    ///    "company": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "email": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "pictureUrl": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "uri"
    ///    },
    ///    "userId": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetMyAccountResponseProfile {
        pub company: ::std::option::Option<::std::string::String>,
        pub email: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "pictureUrl")]
        pub picture_url: ::std::option::Option<::std::string::String>,
        #[serde(rename = "userId")]
        pub user_id: ::std::string::String,
    }
    impl ::std::convert::From<&GetMyAccountResponseProfile>
    for GetMyAccountResponseProfile {
        fn from(value: &GetMyAccountResponseProfile) -> Self {
            value.clone()
        }
    }
    ///`GetMyAccountResponseSecurity`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "hasPassword",
    ///    "lastPasswordChangeAt",
    ///    "twoFactorEnabled"
    ///  ],
    ///  "properties": {
    ///    "hasPassword": {
    ///      "type": "boolean"
    ///    },
    ///    "lastPasswordChangeAt": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "date-time",
    ///      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    ///    },
    ///    "twoFactorEnabled": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetMyAccountResponseSecurity {
        #[serde(rename = "hasPassword")]
        pub has_password: bool,
        #[serde(rename = "lastPasswordChangeAt")]
        pub last_password_change_at: ::std::option::Option<
            ::chrono::DateTime<::chrono::offset::Utc>,
        >,
        #[serde(rename = "twoFactorEnabled")]
        pub two_factor_enabled: bool,
    }
    impl ::std::convert::From<&GetMyAccountResponseSecurity>
    for GetMyAccountResponseSecurity {
        fn from(value: &GetMyAccountResponseSecurity) -> Self {
            value.clone()
        }
    }
    ///`GetNeedsYouPanelResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "stops"
    ///  ],
    ///  "properties": {
    ///    "stops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "availableResolutions",
    ///          "detail",
    ///          "kind",
    ///          "raisedAt",
    ///          "stopId",
    ///          "title"
    ///        ],
    ///        "properties": {
    ///          "availableResolutions": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/StopResolution"
    ///            }
    ///          },
    ///          "detail": {
    ///            "type": "string"
    ///          },
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "issueKey": {
    ///            "type": "string"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          },
    ///          "raisedAt": {
    ///            "type": "string"
    ///          },
    ///          "stopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "title": {
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
    pub struct GetNeedsYouPanelResponse {
        pub stops: ::std::vec::Vec<GetNeedsYouPanelResponseStopsItem>,
    }
    impl ::std::convert::From<&GetNeedsYouPanelResponse> for GetNeedsYouPanelResponse {
        fn from(value: &GetNeedsYouPanelResponse) -> Self {
            value.clone()
        }
    }
    ///`GetNeedsYouPanelResponseStopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "availableResolutions",
    ///    "detail",
    ///    "kind",
    ///    "raisedAt",
    ///    "stopId",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "availableResolutions": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/StopResolution"
    ///      }
    ///    },
    ///    "detail": {
    ///      "type": "string"
    ///    },
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "issueKey": {
    ///      "type": "string"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    },
    ///    "raisedAt": {
    ///      "type": "string"
    ///    },
    ///    "stopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetNeedsYouPanelResponseStopsItem {
        #[serde(rename = "availableResolutions")]
        pub available_resolutions: ::std::vec::Vec<
            ::codm_contracts_rust::wire::enums::StopResolution,
        >,
        pub detail: ::std::string::String,
        #[serde(
            rename = "issueId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub issue_id: ::std::option::Option<::uuid::Uuid>,
        #[serde(
            rename = "issueKey",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub issue_key: ::std::option::Option<::std::string::String>,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
        #[serde(rename = "raisedAt")]
        pub raised_at: ::std::string::String,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetNeedsYouPanelResponseStopsItem>
    for GetNeedsYouPanelResponseStopsItem {
        fn from(value: &GetNeedsYouPanelResponseStopsItem) -> Self {
            value.clone()
        }
    }
    ///`GetOnboardingResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelDone",
    ///    "completedAt",
    ///    "currentStep",
    ///    "state",
    ///    "threadDone",
    ///    "workspaceDone"
    ///  ],
    ///  "properties": {
    ///    "channelDone": {
    ///      "type": "boolean"
    ///    },
    ///    "completedAt": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "date-time",
    ///      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
    ///    },
    ///    "currentStep": {
    ///      "$ref": "#/components/schemas/OnboardingStep"
    ///    },
    ///    "state": {
    ///      "type": "object",
    ///      "properties": {
    ///        "contactRef": {
    ///          "type": "object",
    ///          "required": [
    ///            "channelId",
    ///            "displayName",
    ///            "externalId",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "channelId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "displayName": {
    ///              "type": "string",
    ///              "minLength": 1
    ///            },
    ///            "externalId": {
    ///              "type": "string",
    ///              "minLength": 1
    ///            },
    ///            "kind": {
    ///              "$ref": "#/components/schemas/ContactKind"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        "providers": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "minItems": 1
    ///        },
    ///        "workspace": {
    ///          "type": "object",
    ///          "properties": {
    ///            "existingWorkspaceId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "path": {
    ///              "type": "string",
    ///              "maxLength": 1024,
    ///              "minLength": 1,
    ///              "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "threadDone": {
    ///      "type": "boolean"
    ///    },
    ///    "workspaceDone": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetOnboardingResponse {
        #[serde(rename = "channelDone")]
        pub channel_done: bool,
        #[serde(rename = "completedAt")]
        pub completed_at: ::std::option::Option<
            ::chrono::DateTime<::chrono::offset::Utc>,
        >,
        #[serde(rename = "currentStep")]
        pub current_step: ::codm_contracts_rust::wire::enums::OnboardingStep,
        pub state: GetOnboardingResponseState,
        #[serde(rename = "threadDone")]
        pub thread_done: bool,
        #[serde(rename = "workspaceDone")]
        pub workspace_done: bool,
    }
    impl ::std::convert::From<&GetOnboardingResponse> for GetOnboardingResponse {
        fn from(value: &GetOnboardingResponse) -> Self {
            value.clone()
        }
    }
    ///`GetOnboardingResponseState`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "contactRef": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "externalId": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "kind": {
    ///          "$ref": "#/components/schemas/ContactKind"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      },
    ///      "minItems": 1
    ///    },
    ///    "workspace": {
    ///      "type": "object",
    ///      "properties": {
    ///        "existingWorkspaceId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "path": {
    ///          "type": "string",
    ///          "maxLength": 1024,
    ///          "minLength": 1,
    ///          "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
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
    pub struct GetOnboardingResponseState {
        #[serde(
            rename = "contactRef",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub contact_ref: ::std::option::Option<GetOnboardingResponseStateContactRef>,
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub workspace: ::std::option::Option<GetOnboardingResponseStateWorkspace>,
    }
    impl ::std::convert::From<&GetOnboardingResponseState>
    for GetOnboardingResponseState {
        fn from(value: &GetOnboardingResponseState) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for GetOnboardingResponseState {
        fn default() -> Self {
            Self {
                contact_ref: Default::default(),
                providers: Default::default(),
                workspace: Default::default(),
            }
        }
    }
    ///`GetOnboardingResponseStateContactRef`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "kind"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "externalId": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetOnboardingResponseStateContactRef {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: GetOnboardingResponseStateContactRefDisplayName,
        #[serde(rename = "externalId")]
        pub external_id: GetOnboardingResponseStateContactRefExternalId,
        pub kind: ::codm_contracts_rust::wire::enums::ContactKind,
    }
    impl ::std::convert::From<&GetOnboardingResponseStateContactRef>
    for GetOnboardingResponseStateContactRef {
        fn from(value: &GetOnboardingResponseStateContactRef) -> Self {
            value.clone()
        }
    }
    ///`GetOnboardingResponseStateContactRefDisplayName`
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
    pub struct GetOnboardingResponseStateContactRefDisplayName(::std::string::String);
    impl ::std::ops::Deref for GetOnboardingResponseStateContactRefDisplayName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<GetOnboardingResponseStateContactRefDisplayName>
    for ::std::string::String {
        fn from(value: GetOnboardingResponseStateContactRefDisplayName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&GetOnboardingResponseStateContactRefDisplayName>
    for GetOnboardingResponseStateContactRefDisplayName {
        fn from(value: &GetOnboardingResponseStateContactRefDisplayName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for GetOnboardingResponseStateContactRefDisplayName {
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
    impl ::std::convert::TryFrom<&str>
    for GetOnboardingResponseStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for GetOnboardingResponseStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for GetOnboardingResponseStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for GetOnboardingResponseStateContactRefDisplayName {
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
    ///`GetOnboardingResponseStateContactRefExternalId`
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
    pub struct GetOnboardingResponseStateContactRefExternalId(::std::string::String);
    impl ::std::ops::Deref for GetOnboardingResponseStateContactRefExternalId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<GetOnboardingResponseStateContactRefExternalId>
    for ::std::string::String {
        fn from(value: GetOnboardingResponseStateContactRefExternalId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&GetOnboardingResponseStateContactRefExternalId>
    for GetOnboardingResponseStateContactRefExternalId {
        fn from(value: &GetOnboardingResponseStateContactRefExternalId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for GetOnboardingResponseStateContactRefExternalId {
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
    impl ::std::convert::TryFrom<&str>
    for GetOnboardingResponseStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for GetOnboardingResponseStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for GetOnboardingResponseStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for GetOnboardingResponseStateContactRefExternalId {
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
    ///`GetOnboardingResponseStateWorkspace`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "existingWorkspaceId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "path": {
    ///      "type": "string",
    ///      "maxLength": 1024,
    ///      "minLength": 1,
    ///      "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetOnboardingResponseStateWorkspace {
        #[serde(
            rename = "existingWorkspaceId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub existing_workspace_id: ::std::option::Option<::uuid::Uuid>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub path: ::std::option::Option<GetOnboardingResponseStateWorkspacePath>,
    }
    impl ::std::convert::From<&GetOnboardingResponseStateWorkspace>
    for GetOnboardingResponseStateWorkspace {
        fn from(value: &GetOnboardingResponseStateWorkspace) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for GetOnboardingResponseStateWorkspace {
        fn default() -> Self {
            Self {
                existing_workspace_id: Default::default(),
                path: Default::default(),
            }
        }
    }
    ///`GetOnboardingResponseStateWorkspacePath`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 1024,
    ///  "minLength": 1,
    ///  "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct GetOnboardingResponseStateWorkspacePath(::std::string::String);
    impl ::std::ops::Deref for GetOnboardingResponseStateWorkspacePath {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<GetOnboardingResponseStateWorkspacePath>
    for ::std::string::String {
        fn from(value: GetOnboardingResponseStateWorkspacePath) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&GetOnboardingResponseStateWorkspacePath>
    for GetOnboardingResponseStateWorkspacePath {
        fn from(value: &GetOnboardingResponseStateWorkspacePath) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for GetOnboardingResponseStateWorkspacePath {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 1024usize {
                return Err("longer than 1024 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for GetOnboardingResponseStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for GetOnboardingResponseStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for GetOnboardingResponseStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for GetOnboardingResponseStateWorkspacePath {
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
    ///`GetOperatorIdentityResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "identity": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "hasAvatar"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string"
    ///        },
    ///        "externalId": {
    ///          "type": "string"
    ///        },
    ///        "hasAvatar": {
    ///          "type": "boolean"
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
    pub struct GetOperatorIdentityResponse {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub identity: ::std::option::Option<GetOperatorIdentityResponseIdentity>,
    }
    impl ::std::convert::From<&GetOperatorIdentityResponse>
    for GetOperatorIdentityResponse {
        fn from(value: &GetOperatorIdentityResponse) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for GetOperatorIdentityResponse {
        fn default() -> Self {
            Self {
                identity: Default::default(),
            }
        }
    }
    ///`GetOperatorIdentityResponseIdentity`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetOperatorIdentityResponseIdentity {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
    }
    impl ::std::convert::From<&GetOperatorIdentityResponseIdentity>
    for GetOperatorIdentityResponseIdentity {
        fn from(value: &GetOperatorIdentityResponseIdentity) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "activeStops",
    ///    "composerMode",
    ///    "mentionGate",
    ///    "paused",
    ///    "thread",
    ///    "transcript"
    ///  ],
    ///  "properties": {
    ///    "activeStops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "detail",
    ///          "kind",
    ///          "raisedAt",
    ///          "stopId",
    ///          "title"
    ///        ],
    ///        "properties": {
    ///          "detail": {
    ///            "type": "string"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/StopKind"
    ///          },
    ///          "raisedAt": {
    ///            "type": "string"
    ///          },
    ///          "stopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "composerMode": {
    ///      "$ref": "#/components/schemas/ThreadMode"
    ///    },
    ///    "mentionGate": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                false
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled",
    ///            "tag"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                true
    ///              ]
    ///            },
    ///            "tag": {
    ///              "type": "string"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      ]
    ///    },
    ///    "paused": {
    ///      "type": "boolean"
    ///    },
    ///    "thread": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "channelKind",
    ///        "displayName",
    ///        "externalId",
    ///        "hasAvatar",
    ///        "lastActivity",
    ///        "providers",
    ///        "status",
    ///        "threadId",
    ///        "workspacePath"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "channelKind": {
    ///          "$ref": "#/components/schemas/ChannelKind"
    ///        },
    ///        "displayName": {
    ///          "type": "string"
    ///        },
    ///        "externalId": {
    ///          "type": "string"
    ///        },
    ///        "hasAvatar": {
    ///          "type": "boolean"
    ///        },
    ///        "lastActivity": {
    ///          "type": "string"
    ///        },
    ///        "providers": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          }
    ///        },
    ///        "status": {
    ///          "$ref": "#/components/schemas/ThreadStatus"
    ///        },
    ///        "threadId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "workspacePath": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "transcript": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "at",
    ///          "entryId",
    ///          "kind",
    ///          "text"
    ///        ],
    ///        "properties": {
    ///          "artifact": {
    ///            "type": "object",
    ///            "required": [
    ///              "artifactId",
    ///              "kind",
    ///              "meta",
    ///              "name",
    ///              "recordedAt",
    ///              "ref"
    ///            ],
    ///            "properties": {
    ///              "artifactId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "kind": {
    ///                "$ref": "#/components/schemas/ArtifactKind"
    ///              },
    ///              "meta": {
    ///                "type": "string"
    ///              },
    ///              "name": {
    ///                "type": "string"
    ///              },
    ///              "recordedAt": {
    ///                "type": "string"
    ///              },
    ///              "ref": {
    ///                "type": "string"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          "at": {
    ///            "type": "string"
    ///          },
    ///          "classification": {
    ///            "$ref": "#/components/schemas/ClassificationMethod"
    ///          },
    ///          "entryId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/TranscriptKind"
    ///          },
    ///          "provider": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "quotedEntryId": {
    ///            "type": "string"
    ///          },
    ///          "sender": {
    ///            "type": "object",
    ///            "required": [
    ///              "channelId",
    ///              "displayName",
    ///              "externalId",
    ///              "hasAvatar"
    ///            ],
    ///            "properties": {
    ///              "channelId": {
    ///                "type": "string",
    ///                "format": "uuid",
    ///                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///              },
    ///              "displayName": {
    ///                "type": "string"
    ///              },
    ///              "externalId": {
    ///                "type": "string"
    ///              },
    ///              "hasAvatar": {
    ///                "type": "boolean"
    ///              }
    ///            },
    ///            "additionalProperties": false
    ///          },
    ///          "text": {
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
    pub struct GetSessionChatResponse {
        #[serde(rename = "activeStops")]
        pub active_stops: ::std::vec::Vec<GetSessionChatResponseActiveStopsItem>,
        #[serde(rename = "composerMode")]
        pub composer_mode: ::codm_contracts_rust::wire::enums::ThreadMode,
        #[serde(rename = "mentionGate")]
        pub mention_gate: GetSessionChatResponseMentionGate,
        pub paused: bool,
        pub thread: GetSessionChatResponseThread,
        pub transcript: ::std::vec::Vec<GetSessionChatResponseTranscriptItem>,
    }
    impl ::std::convert::From<&GetSessionChatResponse> for GetSessionChatResponse {
        fn from(value: &GetSessionChatResponse) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseActiveStopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "detail",
    ///    "kind",
    ///    "raisedAt",
    ///    "stopId",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "detail": {
    ///      "type": "string"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    },
    ///    "raisedAt": {
    ///      "type": "string"
    ///    },
    ///    "stopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionChatResponseActiveStopsItem {
        pub detail: ::std::string::String,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
        #[serde(rename = "raisedAt")]
        pub raised_at: ::std::string::String,
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionChatResponseActiveStopsItem>
    for GetSessionChatResponseActiveStopsItem {
        fn from(value: &GetSessionChatResponseActiveStopsItem) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseMentionGate`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            false
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled",
    ///        "tag"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            true
    ///          ]
    ///        },
    ///        "tag": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged, deny_unknown_fields)]
    pub enum GetSessionChatResponseMentionGate {
        Variant0 { enabled: bool },
        Variant1 { enabled: bool, tag: ::std::string::String },
    }
    impl ::std::convert::From<&Self> for GetSessionChatResponseMentionGate {
        fn from(value: &GetSessionChatResponseMentionGate) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseThread`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "channelKind",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar",
    ///    "lastActivity",
    ///    "providers",
    ///    "status",
    ///    "threadId",
    ///    "workspacePath"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "channelKind": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    },
    ///    "lastActivity": {
    ///      "type": "string"
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ThreadStatus"
    ///    },
    ///    "threadId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "workspacePath": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionChatResponseThread {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "channelKind")]
        pub channel_kind: ::codm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
        #[serde(rename = "lastActivity")]
        pub last_activity: ::std::string::String,
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        pub status: ::codm_contracts_rust::wire::enums::ThreadStatus,
        #[serde(rename = "threadId")]
        pub thread_id: ::uuid::Uuid,
        #[serde(rename = "workspacePath")]
        pub workspace_path: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionChatResponseThread>
    for GetSessionChatResponseThread {
        fn from(value: &GetSessionChatResponseThread) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseTranscriptItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "entryId",
    ///    "kind",
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "artifact": {
    ///      "type": "object",
    ///      "required": [
    ///        "artifactId",
    ///        "kind",
    ///        "meta",
    ///        "name",
    ///        "recordedAt",
    ///        "ref"
    ///      ],
    ///      "properties": {
    ///        "artifactId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "kind": {
    ///          "$ref": "#/components/schemas/ArtifactKind"
    ///        },
    ///        "meta": {
    ///          "type": "string"
    ///        },
    ///        "name": {
    ///          "type": "string"
    ///        },
    ///        "recordedAt": {
    ///          "type": "string"
    ///        },
    ///        "ref": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "at": {
    ///      "type": "string"
    ///    },
    ///    "classification": {
    ///      "$ref": "#/components/schemas/ClassificationMethod"
    ///    },
    ///    "entryId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/TranscriptKind"
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "quotedEntryId": {
    ///      "type": "string"
    ///    },
    ///    "sender": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "hasAvatar"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string"
    ///        },
    ///        "externalId": {
    ///          "type": "string"
    ///        },
    ///        "hasAvatar": {
    ///          "type": "boolean"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionChatResponseTranscriptItem {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub artifact: ::std::option::Option<
            GetSessionChatResponseTranscriptItemArtifact,
        >,
        pub at: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub classification: ::std::option::Option<
            ::codm_contracts_rust::wire::enums::ClassificationMethod,
        >,
        #[serde(rename = "entryId")]
        pub entry_id: ::uuid::Uuid,
        #[serde(
            rename = "issueId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub issue_id: ::std::option::Option<::uuid::Uuid>,
        pub kind: ::codm_contracts_rust::wire::enums::TranscriptKind,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub provider: ::std::option::Option<
            ::codm_contracts_rust::wire::enums::ProviderKind,
        >,
        #[serde(
            rename = "quotedEntryId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub quoted_entry_id: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub sender: ::std::option::Option<GetSessionChatResponseTranscriptItemSender>,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionChatResponseTranscriptItem>
    for GetSessionChatResponseTranscriptItem {
        fn from(value: &GetSessionChatResponseTranscriptItem) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseTranscriptItemArtifact`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "artifactId",
    ///    "kind",
    ///    "meta",
    ///    "name",
    ///    "recordedAt",
    ///    "ref"
    ///  ],
    ///  "properties": {
    ///    "artifactId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ArtifactKind"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "recordedAt": {
    ///      "type": "string"
    ///    },
    ///    "ref": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionChatResponseTranscriptItemArtifact {
        #[serde(rename = "artifactId")]
        pub artifact_id: ::uuid::Uuid,
        pub kind: ::codm_contracts_rust::wire::enums::ArtifactKind,
        pub meta: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "recordedAt")]
        pub recorded_at: ::std::string::String,
        #[serde(rename = "ref")]
        pub ref_: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionChatResponseTranscriptItemArtifact>
    for GetSessionChatResponseTranscriptItemArtifact {
        fn from(value: &GetSessionChatResponseTranscriptItemArtifact) -> Self {
            value.clone()
        }
    }
    ///`GetSessionChatResponseTranscriptItemSender`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "hasAvatar"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "externalId": {
    ///      "type": "string"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionChatResponseTranscriptItemSender {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: ::std::string::String,
        #[serde(rename = "externalId")]
        pub external_id: ::std::string::String,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
    }
    impl ::std::convert::From<&GetSessionChatResponseTranscriptItemSender>
    for GetSessionChatResponseTranscriptItemSender {
        fn from(value: &GetSessionChatResponseTranscriptItemSender) -> Self {
            value.clone()
        }
    }
    ///`GetSessionIssuesResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "archived",
    ///    "groups",
    ///    "statsLine"
    ///  ],
    ///  "properties": {
    ///    "archived": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "archived",
    ///          "issueId",
    ///          "key",
    ///          "status",
    ///          "title"
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
    ///            "type": "string"
    ///          },
    ///          "meta": {
    ///            "type": "string"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "groups": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "items",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "items": {
    ///            "type": "array",
    ///            "items": {
    ///              "type": "object",
    ///              "required": [
    ///                "archived",
    ///                "issueId",
    ///                "key",
    ///                "status",
    ///                "title"
    ///              ],
    ///              "properties": {
    ///                "archived": {
    ///                  "type": "boolean"
    ///                },
    ///                "issueId": {
    ///                  "type": "string",
    ///                  "format": "uuid",
    ///                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///                },
    ///                "key": {
    ///                  "type": "string"
    ///                },
    ///                "meta": {
    ///                  "type": "string"
    ///                },
    ///                "status": {
    ///                  "$ref": "#/components/schemas/IssueStatus"
    ///                },
    ///                "title": {
    ///                  "type": "string"
    ///                }
    ///              },
    ///              "additionalProperties": false
    ///            }
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "statsLine": {
    ///      "type": "object",
    ///      "required": [
    ///        "awaitingInput",
    ///        "completed",
    ///        "working"
    ///      ],
    ///      "properties": {
    ///        "awaitingInput": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "completed": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
    ///        },
    ///        "working": {
    ///          "type": "integer",
    ///          "maximum": 9007199254740991.0,
    ///          "minimum": -9007199254740991.0
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
    pub struct GetSessionIssuesResponse {
        pub archived: ::std::vec::Vec<GetSessionIssuesResponseArchivedItem>,
        pub groups: ::std::vec::Vec<GetSessionIssuesResponseGroupsItem>,
        #[serde(rename = "statsLine")]
        pub stats_line: GetSessionIssuesResponseStatsLine,
    }
    impl ::std::convert::From<&GetSessionIssuesResponse> for GetSessionIssuesResponse {
        fn from(value: &GetSessionIssuesResponse) -> Self {
            value.clone()
        }
    }
    ///`GetSessionIssuesResponseArchivedItem`
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
    ///    "status",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionIssuesResponseArchivedItem {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub meta: ::std::option::Option<::std::string::String>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionIssuesResponseArchivedItem>
    for GetSessionIssuesResponseArchivedItem {
        fn from(value: &GetSessionIssuesResponseArchivedItem) -> Self {
            value.clone()
        }
    }
    ///`GetSessionIssuesResponseGroupsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "items",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "items": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "archived",
    ///          "issueId",
    ///          "key",
    ///          "status",
    ///          "title"
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
    ///            "type": "string"
    ///          },
    ///          "meta": {
    ///            "type": "string"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/IssueStatus"
    ///          },
    ///          "title": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionIssuesResponseGroupsItem {
        pub items: ::std::vec::Vec<GetSessionIssuesResponseGroupsItemItemsItem>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
    }
    impl ::std::convert::From<&GetSessionIssuesResponseGroupsItem>
    for GetSessionIssuesResponseGroupsItem {
        fn from(value: &GetSessionIssuesResponseGroupsItem) -> Self {
            value.clone()
        }
    }
    ///`GetSessionIssuesResponseGroupsItemItemsItem`
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
    ///    "status",
    ///    "title"
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
    ///      "type": "string"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionIssuesResponseGroupsItemItemsItem {
        pub archived: bool,
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub key: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub meta: ::std::option::Option<::std::string::String>,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&GetSessionIssuesResponseGroupsItemItemsItem>
    for GetSessionIssuesResponseGroupsItemItemsItem {
        fn from(value: &GetSessionIssuesResponseGroupsItemItemsItem) -> Self {
            value.clone()
        }
    }
    ///`GetSessionIssuesResponseStatsLine`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "awaitingInput",
    ///    "completed",
    ///    "working"
    ///  ],
    ///  "properties": {
    ///    "awaitingInput": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "completed": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "working": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSessionIssuesResponseStatsLine {
        #[serde(rename = "awaitingInput")]
        pub awaiting_input: i64,
        pub completed: i64,
        pub working: i64,
    }
    impl ::std::convert::From<&GetSessionIssuesResponseStatsLine>
    for GetSessionIssuesResponseStatsLine {
        fn from(value: &GetSessionIssuesResponseStatsLine) -> Self {
            value.clone()
        }
    }
    ///`GetSettingsResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "appVersion",
    ///    "general",
    ///    "providers",
    ///    "stopCriteria"
    ///  ],
    ///  "properties": {
    ///    "appVersion": {
    ///      "type": "string"
    ///    },
    ///    "general": {
    ///      "type": "object",
    ///      "required": [
    ///        "dataDir",
    ///        "operatorName",
    ///        "timezone"
    ///      ],
    ///      "properties": {
    ///        "dataDir": {
    ///          "type": "string"
    ///        },
    ///        "operatorName": {
    ///          "type": "string"
    ///        },
    ///        "timezone": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "available",
    ///          "comingSoon",
    ///          "provider",
    ///          "status"
    ///        ],
    ///        "properties": {
    ///          "available": {
    ///            "type": "boolean"
    ///          },
    ///          "comingSoon": {
    ///            "type": "boolean"
    ///          },
    ///          "provider": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "status": {
    ///            "$ref": "#/components/schemas/ProviderStatus"
    ///          },
    ///          "version": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "stopCriteria": {
    ///      "type": "object",
    ///      "required": [
    ///        "approvalNeeded",
    ///        "authRequired",
    ///        "blockedByClassification",
    ///        "humanRequested",
    ///        "serverErrors"
    ///      ],
    ///      "properties": {
    ///        "approvalNeeded": {
    ///          "type": "boolean"
    ///        },
    ///        "authRequired": {
    ///          "type": "boolean"
    ///        },
    ///        "blockedByClassification": {
    ///          "type": "boolean"
    ///        },
    ///        "humanRequested": {
    ///          "type": "boolean"
    ///        },
    ///        "serverErrors": {
    ///          "type": "boolean"
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
    pub struct GetSettingsResponse {
        #[serde(rename = "appVersion")]
        pub app_version: ::std::string::String,
        pub general: GetSettingsResponseGeneral,
        pub providers: ::std::vec::Vec<GetSettingsResponseProvidersItem>,
        #[serde(rename = "stopCriteria")]
        pub stop_criteria: GetSettingsResponseStopCriteria,
    }
    impl ::std::convert::From<&GetSettingsResponse> for GetSettingsResponse {
        fn from(value: &GetSettingsResponse) -> Self {
            value.clone()
        }
    }
    ///`GetSettingsResponseGeneral`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "dataDir",
    ///    "operatorName",
    ///    "timezone"
    ///  ],
    ///  "properties": {
    ///    "dataDir": {
    ///      "type": "string"
    ///    },
    ///    "operatorName": {
    ///      "type": "string"
    ///    },
    ///    "timezone": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSettingsResponseGeneral {
        #[serde(rename = "dataDir")]
        pub data_dir: ::std::string::String,
        #[serde(rename = "operatorName")]
        pub operator_name: ::std::string::String,
        pub timezone: ::std::string::String,
    }
    impl ::std::convert::From<&GetSettingsResponseGeneral>
    for GetSettingsResponseGeneral {
        fn from(value: &GetSettingsResponseGeneral) -> Self {
            value.clone()
        }
    }
    ///`GetSettingsResponseProvidersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "available",
    ///    "comingSoon",
    ///    "provider",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "available": {
    ///      "type": "boolean"
    ///    },
    ///    "comingSoon": {
    ///      "type": "boolean"
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ProviderStatus"
    ///    },
    ///    "version": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSettingsResponseProvidersItem {
        pub available: bool,
        #[serde(rename = "comingSoon")]
        pub coming_soon: bool,
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
        pub status: ::codm_contracts_rust::wire::enums::ProviderStatus,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub version: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&GetSettingsResponseProvidersItem>
    for GetSettingsResponseProvidersItem {
        fn from(value: &GetSettingsResponseProvidersItem) -> Self {
            value.clone()
        }
    }
    ///`GetSettingsResponseStopCriteria`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "approvalNeeded",
    ///    "authRequired",
    ///    "blockedByClassification",
    ///    "humanRequested",
    ///    "serverErrors"
    ///  ],
    ///  "properties": {
    ///    "approvalNeeded": {
    ///      "type": "boolean"
    ///    },
    ///    "authRequired": {
    ///      "type": "boolean"
    ///    },
    ///    "blockedByClassification": {
    ///      "type": "boolean"
    ///    },
    ///    "humanRequested": {
    ///      "type": "boolean"
    ///    },
    ///    "serverErrors": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetSettingsResponseStopCriteria {
        #[serde(rename = "approvalNeeded")]
        pub approval_needed: bool,
        #[serde(rename = "authRequired")]
        pub auth_required: bool,
        #[serde(rename = "blockedByClassification")]
        pub blocked_by_classification: bool,
        #[serde(rename = "humanRequested")]
        pub human_requested: bool,
        #[serde(rename = "serverErrors")]
        pub server_errors: bool,
    }
    impl ::std::convert::From<&GetSettingsResponseStopCriteria>
    for GetSettingsResponseStopCriteria {
        fn from(value: &GetSettingsResponseStopCriteria) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "bufferSize",
    ///    "customPrompt",
    ///    "customPromptMaxLength",
    ///    "invokerCount",
    ///    "mentionGate",
    ///    "participants",
    ///    "providers",
    ///    "reactions",
    ///    "streaming",
    ///    "thinkingIndicator"
    ///  ],
    ///  "properties": {
    ///    "bufferSize": {
    ///      "$ref": "#/components/schemas/BufferSize"
    ///    },
    ///    "customPrompt": {
    ///      "type": "string"
    ///    },
    ///    "customPromptMaxLength": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "exclusiveMinimum": 0.0
    ///    },
    ///    "invokerCount": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "mentionGate": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                false
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "enabled",
    ///            "tag"
    ///          ],
    ///          "properties": {
    ///            "enabled": {
    ///              "type": "boolean",
    ///              "enum": [
    ///                true
    ///              ]
    ///            },
    ///            "tag": {
    ///              "type": "string"
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      ]
    ///    },
    ///    "participants": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "canInvoke",
    ///          "channelId",
    ///          "hasAvatar",
    ///          "name",
    ///          "participantId",
    ///          "source"
    ///        ],
    ///        "properties": {
    ///          "canInvoke": {
    ///            "type": "boolean"
    ///          },
    ///          "channelId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "hasAvatar": {
    ///            "type": "boolean"
    ///          },
    ///          "name": {
    ///            "type": "string"
    ///          },
    ///          "participantId": {
    ///            "type": "string"
    ///          },
    ///          "source": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "comingSoon",
    ///          "model",
    ///          "models",
    ///          "provider"
    ///        ],
    ///        "properties": {
    ///          "comingSoon": {
    ///            "type": "boolean"
    ///          },
    ///          "model": {
    ///            "$ref": "#/components/schemas/AgentModelId"
    ///          },
    ///          "models": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/AgentModelId"
    ///            }
    ///          },
    ///          "provider": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "reactions": {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "streaming": {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "thinkingIndicator": {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean"
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
    pub struct GetThreadSettingsResponse {
        #[serde(rename = "bufferSize")]
        pub buffer_size: ::codm_contracts_rust::wire::enums::BufferSize,
        #[serde(rename = "customPrompt")]
        pub custom_prompt: ::std::string::String,
        #[serde(rename = "customPromptMaxLength")]
        pub custom_prompt_max_length: ::std::num::NonZeroU64,
        #[serde(rename = "invokerCount")]
        pub invoker_count: i64,
        #[serde(rename = "mentionGate")]
        pub mention_gate: GetThreadSettingsResponseMentionGate,
        pub participants: ::std::vec::Vec<GetThreadSettingsResponseParticipantsItem>,
        pub providers: ::std::vec::Vec<GetThreadSettingsResponseProvidersItem>,
        pub reactions: GetThreadSettingsResponseReactions,
        pub streaming: GetThreadSettingsResponseStreaming,
        #[serde(rename = "thinkingIndicator")]
        pub thinking_indicator: GetThreadSettingsResponseThinkingIndicator,
    }
    impl ::std::convert::From<&GetThreadSettingsResponse> for GetThreadSettingsResponse {
        fn from(value: &GetThreadSettingsResponse) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseMentionGate`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            false
    ///          ]
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "enabled",
    ///        "tag"
    ///      ],
    ///      "properties": {
    ///        "enabled": {
    ///          "type": "boolean",
    ///          "enum": [
    ///            true
    ///          ]
    ///        },
    ///        "tag": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    }
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged, deny_unknown_fields)]
    pub enum GetThreadSettingsResponseMentionGate {
        Variant0 { enabled: bool },
        Variant1 { enabled: bool, tag: ::std::string::String },
    }
    impl ::std::convert::From<&Self> for GetThreadSettingsResponseMentionGate {
        fn from(value: &GetThreadSettingsResponseMentionGate) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseParticipantsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "canInvoke",
    ///    "channelId",
    ///    "hasAvatar",
    ///    "name",
    ///    "participantId",
    ///    "source"
    ///  ],
    ///  "properties": {
    ///    "canInvoke": {
    ///      "type": "boolean"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "hasAvatar": {
    ///      "type": "boolean"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "participantId": {
    ///      "type": "string"
    ///    },
    ///    "source": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetThreadSettingsResponseParticipantsItem {
        #[serde(rename = "canInvoke")]
        pub can_invoke: bool,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "hasAvatar")]
        pub has_avatar: bool,
        pub name: ::std::string::String,
        #[serde(rename = "participantId")]
        pub participant_id: ::std::string::String,
        pub source: ::std::string::String,
    }
    impl ::std::convert::From<&GetThreadSettingsResponseParticipantsItem>
    for GetThreadSettingsResponseParticipantsItem {
        fn from(value: &GetThreadSettingsResponseParticipantsItem) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseProvidersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "comingSoon",
    ///    "model",
    ///    "models",
    ///    "provider"
    ///  ],
    ///  "properties": {
    ///    "comingSoon": {
    ///      "type": "boolean"
    ///    },
    ///    "model": {
    ///      "$ref": "#/components/schemas/AgentModelId"
    ///    },
    ///    "models": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/AgentModelId"
    ///      }
    ///    },
    ///    "provider": {
    ///      "$ref": "#/components/schemas/ProviderKind"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetThreadSettingsResponseProvidersItem {
        #[serde(rename = "comingSoon")]
        pub coming_soon: bool,
        pub model: ::codm_contracts_rust::wire::enums::AgentModelId,
        pub models: ::std::vec::Vec<::codm_contracts_rust::wire::enums::AgentModelId>,
        pub provider: ::codm_contracts_rust::wire::enums::ProviderKind,
    }
    impl ::std::convert::From<&GetThreadSettingsResponseProvidersItem>
    for GetThreadSettingsResponseProvidersItem {
        fn from(value: &GetThreadSettingsResponseProvidersItem) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseReactions`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetThreadSettingsResponseReactions {
        pub enabled: bool,
    }
    impl ::std::convert::From<&GetThreadSettingsResponseReactions>
    for GetThreadSettingsResponseReactions {
        fn from(value: &GetThreadSettingsResponseReactions) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseStreaming`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetThreadSettingsResponseStreaming {
        pub enabled: bool,
    }
    impl ::std::convert::From<&GetThreadSettingsResponseStreaming>
    for GetThreadSettingsResponseStreaming {
        fn from(value: &GetThreadSettingsResponseStreaming) -> Self {
            value.clone()
        }
    }
    ///`GetThreadSettingsResponseThinkingIndicator`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct GetThreadSettingsResponseThinkingIndicator {
        pub enabled: bool,
    }
    impl ::std::convert::From<&GetThreadSettingsResponseThinkingIndicator>
    for GetThreadSettingsResponseThinkingIndicator {
        fn from(value: &GetThreadSettingsResponseThinkingIndicator) -> Self {
            value.clone()
        }
    }
    ///`GetUserInfoResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "current",
    ///    "owners",
    ///    "user"
    ///  ],
    ///  "properties": {
    ///    "current": {
    ///      "type": [
    ///        "object",
    ///        "null"
    ///      ],
    ///      "required": [
    ///        "id",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "id": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "name": {
    ///          "type": "string"
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    "owners": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "id",
    ///          "name"
    ///        ],
    ///        "properties": {
    ///          "id": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "name": {
    ///            "type": "string"
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "user": {
    ///      "type": "object",
    ///      "required": [
    ///        "avatarUrl",
    ///        "email",
    ///        "id",
    ///        "name"
    ///      ],
    ///      "properties": {
    ///        "avatarUrl": {
    ///          "type": [
    ///            "string",
    ///            "null"
    ///          ],
    ///          "format": "uri"
    ///        },
    ///        "email": {
    ///          "type": "string",
    ///          "format": "email",
    ///          "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    ///        },
    ///        "id": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "name": {
    ///          "type": "string"
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
    pub struct GetUserInfoResponse {
        pub current: ::std::option::Option<GetUserInfoResponseCurrent>,
        pub owners: ::std::vec::Vec<GetUserInfoResponseOwnersItem>,
        pub user: GetUserInfoResponseUser,
    }
    impl ::std::convert::From<&GetUserInfoResponse> for GetUserInfoResponse {
        fn from(value: &GetUserInfoResponse) -> Self {
            value.clone()
        }
    }
    ///`GetUserInfoResponseCurrent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
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
    pub struct GetUserInfoResponseCurrent {
        pub id: ::uuid::Uuid,
        pub name: ::std::string::String,
    }
    impl ::std::convert::From<&GetUserInfoResponseCurrent>
    for GetUserInfoResponseCurrent {
        fn from(value: &GetUserInfoResponseCurrent) -> Self {
            value.clone()
        }
    }
    ///`GetUserInfoResponseOwnersItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
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
    pub struct GetUserInfoResponseOwnersItem {
        pub id: ::uuid::Uuid,
        pub name: ::std::string::String,
    }
    impl ::std::convert::From<&GetUserInfoResponseOwnersItem>
    for GetUserInfoResponseOwnersItem {
        fn from(value: &GetUserInfoResponseOwnersItem) -> Self {
            value.clone()
        }
    }
    ///`GetUserInfoResponseUser`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "avatarUrl",
    ///    "email",
    ///    "id",
    ///    "name"
    ///  ],
    ///  "properties": {
    ///    "avatarUrl": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "uri"
    ///    },
    ///    "email": {
    ///      "type": "string",
    ///      "format": "email",
    ///      "pattern": "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    ///    },
    ///    "id": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
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
    pub struct GetUserInfoResponseUser {
        #[serde(rename = "avatarUrl")]
        pub avatar_url: ::std::option::Option<::std::string::String>,
        pub email: ::std::string::String,
        pub id: ::uuid::Uuid,
        pub name: ::std::string::String,
    }
    impl ::std::convert::From<&GetUserInfoResponseUser> for GetUserInfoResponseUser {
        fn from(value: &GetUserInfoResponseUser) -> Self {
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
    ///`ListArtifactsResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "artifacts"
    ///  ],
    ///  "properties": {
    ///    "artifacts": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "artifactId",
    ///          "kind",
    ///          "meta",
    ///          "name",
    ///          "recordedAt",
    ///          "ref"
    ///        ],
    ///        "properties": {
    ///          "artifactId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "issueId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "kind": {
    ///            "$ref": "#/components/schemas/ArtifactKind"
    ///          },
    ///          "meta": {
    ///            "type": "string"
    ///          },
    ///          "name": {
    ///            "type": "string"
    ///          },
    ///          "recordedAt": {
    ///            "type": "string"
    ///          },
    ///          "ref": {
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
    pub struct ListArtifactsResponse {
        pub artifacts: ::std::vec::Vec<ListArtifactsResponseArtifactsItem>,
    }
    impl ::std::convert::From<&ListArtifactsResponse> for ListArtifactsResponse {
        fn from(value: &ListArtifactsResponse) -> Self {
            value.clone()
        }
    }
    ///`ListArtifactsResponseArtifactsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "artifactId",
    ///    "kind",
    ///    "meta",
    ///    "name",
    ///    "recordedAt",
    ///    "ref"
    ///  ],
    ///  "properties": {
    ///    "artifactId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ArtifactKind"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "recordedAt": {
    ///      "type": "string"
    ///    },
    ///    "ref": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ListArtifactsResponseArtifactsItem {
        #[serde(rename = "artifactId")]
        pub artifact_id: ::uuid::Uuid,
        #[serde(
            rename = "issueId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub issue_id: ::std::option::Option<::uuid::Uuid>,
        pub kind: ::codm_contracts_rust::wire::enums::ArtifactKind,
        pub meta: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "recordedAt")]
        pub recorded_at: ::std::string::String,
        #[serde(rename = "ref")]
        pub ref_: ::std::string::String,
    }
    impl ::std::convert::From<&ListArtifactsResponseArtifactsItem>
    for ListArtifactsResponseArtifactsItem {
        fn from(value: &ListArtifactsResponseArtifactsItem) -> Self {
            value.clone()
        }
    }
    ///`ListThreadLoopsResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "loops",
    ///    "maxIntervalMinutes",
    ///    "minIntervalMinutes",
    ///    "promptMaxLength"
    ///  ],
    ///  "properties": {
    ///    "loops": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "enabled",
    ///          "loopId",
    ///          "prompt",
    ///          "schedule"
    ///        ],
    ///        "properties": {
    ///          "enabled": {
    ///            "type": "boolean"
    ///          },
    ///          "lastFiredAt": {
    ///            "type": "string"
    ///          },
    ///          "loopId": {
    ///            "type": "string",
    ///            "format": "uuid",
    ///            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///          },
    ///          "nextRunAt": {
    ///            "type": "string"
    ///          },
    ///          "prompt": {
    ///            "type": "string"
    ///          },
    ///          "schedule": {
    ///            "oneOf": [
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "kind",
    ///                  "timeOfDay",
    ///                  "timezone",
    ///                  "weekdays"
    ///                ],
    ///                "properties": {
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "DAILY"
    ///                    ]
    ///                  },
    ///                  "timeOfDay": {
    ///                    "type": "string",
    ///                    "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///                  },
    ///                  "timezone": {
    ///                    "$ref": "#/components/schemas/Timezone"
    ///                  },
    ///                  "weekdays": {
    ///                    "type": "array",
    ///                    "items": {
    ///                      "$ref": "#/components/schemas/DayOfWeek"
    ///                    },
    ///                    "minItems": 1
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              },
    ///              {
    ///                "type": "object",
    ///                "required": [
    ///                  "everyMinutes",
    ///                  "kind"
    ///                ],
    ///                "properties": {
    ///                  "everyMinutes": {
    ///                    "type": "integer",
    ///                    "maximum": 1440.0,
    ///                    "minimum": 1.0
    ///                  },
    ///                  "kind": {
    ///                    "type": "string",
    ///                    "enum": [
    ///                      "INTERVAL"
    ///                    ]
    ///                  }
    ///                },
    ///                "additionalProperties": false
    ///              }
    ///            ]
    ///          }
    ///        },
    ///        "additionalProperties": false
    ///      }
    ///    },
    ///    "maxIntervalMinutes": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "exclusiveMinimum": 0.0
    ///    },
    ///    "minIntervalMinutes": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "exclusiveMinimum": 0.0
    ///    },
    ///    "promptMaxLength": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "exclusiveMinimum": 0.0
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ListThreadLoopsResponse {
        pub loops: ::std::vec::Vec<ListThreadLoopsResponseLoopsItem>,
        #[serde(rename = "maxIntervalMinutes")]
        pub max_interval_minutes: ::std::num::NonZeroU64,
        #[serde(rename = "minIntervalMinutes")]
        pub min_interval_minutes: ::std::num::NonZeroU64,
        #[serde(rename = "promptMaxLength")]
        pub prompt_max_length: ::std::num::NonZeroU64,
    }
    impl ::std::convert::From<&ListThreadLoopsResponse> for ListThreadLoopsResponse {
        fn from(value: &ListThreadLoopsResponse) -> Self {
            value.clone()
        }
    }
    ///`ListThreadLoopsResponseLoopsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled",
    ///    "loopId",
    ///    "prompt",
    ///    "schedule"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    },
    ///    "lastFiredAt": {
    ///      "type": "string"
    ///    },
    ///    "loopId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "nextRunAt": {
    ///      "type": "string"
    ///    },
    ///    "prompt": {
    ///      "type": "string"
    ///    },
    ///    "schedule": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "kind",
    ///            "timeOfDay",
    ///            "timezone",
    ///            "weekdays"
    ///          ],
    ///          "properties": {
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "DAILY"
    ///              ]
    ///            },
    ///            "timeOfDay": {
    ///              "type": "string",
    ///              "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///            },
    ///            "timezone": {
    ///              "$ref": "#/components/schemas/Timezone"
    ///            },
    ///            "weekdays": {
    ///              "type": "array",
    ///              "items": {
    ///                "$ref": "#/components/schemas/DayOfWeek"
    ///              },
    ///              "minItems": 1
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "everyMinutes",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "everyMinutes": {
    ///              "type": "integer",
    ///              "maximum": 1440.0,
    ///              "minimum": 1.0
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "INTERVAL"
    ///              ]
    ///            }
    ///          },
    ///          "additionalProperties": false
    ///        }
    ///      ]
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct ListThreadLoopsResponseLoopsItem {
        pub enabled: bool,
        #[serde(
            rename = "lastFiredAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub last_fired_at: ::std::option::Option<::std::string::String>,
        #[serde(rename = "loopId")]
        pub loop_id: ::uuid::Uuid,
        #[serde(
            rename = "nextRunAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub next_run_at: ::std::option::Option<::std::string::String>,
        pub prompt: ::std::string::String,
        pub schedule: ListThreadLoopsResponseLoopsItemSchedule,
    }
    impl ::std::convert::From<&ListThreadLoopsResponseLoopsItem>
    for ListThreadLoopsResponseLoopsItem {
        fn from(value: &ListThreadLoopsResponseLoopsItem) -> Self {
            value.clone()
        }
    }
    ///`ListThreadLoopsResponseLoopsItemSchedule`
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
    ///        "timeOfDay",
    ///        "timezone",
    ///        "weekdays"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DAILY"
    ///          ]
    ///        },
    ///        "timeOfDay": {
    ///          "type": "string",
    ///          "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///        },
    ///        "timezone": {
    ///          "$ref": "#/components/schemas/Timezone"
    ///        },
    ///        "weekdays": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/DayOfWeek"
    ///          },
    ///          "minItems": 1
    ///        }
    ///      },
    ///      "additionalProperties": false
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "everyMinutes",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "everyMinutes": {
    ///          "type": "integer",
    ///          "maximum": 1440.0,
    ///          "minimum": 1.0
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "INTERVAL"
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
    pub enum ListThreadLoopsResponseLoopsItemSchedule {
        #[serde(rename = "DAILY")]
        Daily {
            #[serde(rename = "timeOfDay")]
            time_of_day: ListThreadLoopsResponseLoopsItemScheduleTimeOfDay,
            timezone: ::codm_contracts_rust::wire::enums::Timezone,
            weekdays: ::std::vec::Vec<::codm_contracts_rust::wire::enums::DayOfWeek>,
        },
        #[serde(rename = "INTERVAL")]
        Interval {
            #[serde(rename = "everyMinutes")]
            every_minutes: ::std::num::NonZeroU64,
        },
    }
    impl ::std::convert::From<&Self> for ListThreadLoopsResponseLoopsItemSchedule {
        fn from(value: &ListThreadLoopsResponseLoopsItemSchedule) -> Self {
            value.clone()
        }
    }
    ///`ListThreadLoopsResponseLoopsItemScheduleTimeOfDay`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct ListThreadLoopsResponseLoopsItemScheduleTimeOfDay(::std::string::String);
    impl ::std::ops::Deref for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<ListThreadLoopsResponseLoopsItemScheduleTimeOfDay>
    for ::std::string::String {
        fn from(value: ListThreadLoopsResponseLoopsItemScheduleTimeOfDay) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ListThreadLoopsResponseLoopsItemScheduleTimeOfDay>
    for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        fn from(value: &ListThreadLoopsResponseLoopsItemScheduleTimeOfDay) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^([01]\\d|2[0-3]):[0-5]\\d$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^([01]\\d|2[0-3]):[0-5]\\d$\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str>
    for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for ListThreadLoopsResponseLoopsItemScheduleTimeOfDay {
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
    ///`ListWorkspacesResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "workspaces"
    ///  ],
    ///  "properties": {
    ///    "workspaces": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "object",
    ///        "required": [
    ///          "addedAt",
    ///          "badges",
    ///          "path",
    ///          "threadCount",
    ///          "workspaceId"
    ///        ],
    ///        "properties": {
    ///          "addedAt": {
    ///            "type": "string",
    ///            "format": "date-time"
    ///          },
    ///          "badges": {
    ///            "type": "array",
    ///            "items": {
    ///              "$ref": "#/components/schemas/WorkspaceBadge"
    ///            }
    ///          },
    ///          "path": {
    ///            "type": "string"
    ///          },
    ///          "threadCount": {
    ///            "type": "integer",
    ///            "maximum": 9007199254740991.0,
    ///            "minimum": -9007199254740991.0
    ///          },
    ///          "workspaceId": {
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
    pub struct ListWorkspacesResponse {
        pub workspaces: ::std::vec::Vec<ListWorkspacesResponseWorkspacesItem>,
    }
    impl ::std::convert::From<&ListWorkspacesResponse> for ListWorkspacesResponse {
        fn from(value: &ListWorkspacesResponse) -> Self {
            value.clone()
        }
    }
    ///`ListWorkspacesResponseWorkspacesItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "addedAt",
    ///    "badges",
    ///    "path",
    ///    "threadCount",
    ///    "workspaceId"
    ///  ],
    ///  "properties": {
    ///    "addedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "badges": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/WorkspaceBadge"
    ///      }
    ///    },
    ///    "path": {
    ///      "type": "string"
    ///    },
    ///    "threadCount": {
    ///      "type": "integer",
    ///      "maximum": 9007199254740991.0,
    ///      "minimum": -9007199254740991.0
    ///    },
    ///    "workspaceId": {
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
    pub struct ListWorkspacesResponseWorkspacesItem {
        #[serde(rename = "addedAt")]
        pub added_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub badges: ::std::vec::Vec<::codm_contracts_rust::wire::enums::WorkspaceBadge>,
        pub path: ::std::string::String,
        #[serde(rename = "threadCount")]
        pub thread_count: i64,
        #[serde(rename = "workspaceId")]
        pub workspace_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&ListWorkspacesResponseWorkspacesItem>
    for ListWorkspacesResponseWorkspacesItem {
        fn from(value: &ListWorkspacesResponseWorkspacesItem) -> Self {
            value.clone()
        }
    }
    ///`RaiseStopBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "detail",
    ///    "kind"
    ///  ],
    ///  "properties": {
    ///    "detail": {
    ///      "type": "string",
    ///      "maxLength": 4000,
    ///      "minLength": 1
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/StopKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct RaiseStopBody {
        pub detail: RaiseStopBodyDetail,
        pub kind: ::codm_contracts_rust::wire::enums::StopKind,
    }
    impl ::std::convert::From<&RaiseStopBody> for RaiseStopBody {
        fn from(value: &RaiseStopBody) -> Self {
            value.clone()
        }
    }
    ///`RaiseStopBodyDetail`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 4000,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct RaiseStopBodyDetail(::std::string::String);
    impl ::std::ops::Deref for RaiseStopBodyDetail {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<RaiseStopBodyDetail> for ::std::string::String {
        fn from(value: RaiseStopBodyDetail) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&RaiseStopBodyDetail> for RaiseStopBodyDetail {
        fn from(value: &RaiseStopBodyDetail) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for RaiseStopBodyDetail {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 4000usize {
                return Err("longer than 4000 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for RaiseStopBodyDetail {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for RaiseStopBodyDetail {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for RaiseStopBodyDetail {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for RaiseStopBodyDetail {
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
    ///`RaiseStopResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "stopId"
    ///  ],
    ///  "properties": {
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
    pub struct RaiseStopResponse {
        #[serde(rename = "stopId")]
        pub stop_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&RaiseStopResponse> for RaiseStopResponse {
        fn from(value: &RaiseStopResponse) -> Self {
            value.clone()
        }
    }
    ///`RecordArtifactBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "kind",
    ///    "meta",
    ///    "name",
    ///    "ref"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ArtifactKind"
    ///    },
    ///    "meta": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string",
    ///      "maxLength": 200,
    ///      "minLength": 1
    ///    },
    ///    "ref": {
    ///      "type": "string",
    ///      "maxLength": 2048,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct RecordArtifactBody {
        #[serde(
            rename = "issueId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub issue_id: ::std::option::Option<::uuid::Uuid>,
        pub kind: ::codm_contracts_rust::wire::enums::ArtifactKind,
        pub meta: ::std::string::String,
        pub name: RecordArtifactBodyName,
        #[serde(rename = "ref")]
        pub ref_: RecordArtifactBodyRef,
    }
    impl ::std::convert::From<&RecordArtifactBody> for RecordArtifactBody {
        fn from(value: &RecordArtifactBody) -> Self {
            value.clone()
        }
    }
    ///`RecordArtifactBodyName`
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
    pub struct RecordArtifactBodyName(::std::string::String);
    impl ::std::ops::Deref for RecordArtifactBodyName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<RecordArtifactBodyName> for ::std::string::String {
        fn from(value: RecordArtifactBodyName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&RecordArtifactBodyName> for RecordArtifactBodyName {
        fn from(value: &RecordArtifactBodyName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for RecordArtifactBodyName {
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
    impl ::std::convert::TryFrom<&str> for RecordArtifactBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for RecordArtifactBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for RecordArtifactBodyName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for RecordArtifactBodyName {
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
    ///`RecordArtifactBodyRef`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 2048,
    ///  "minLength": 1
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct RecordArtifactBodyRef(::std::string::String);
    impl ::std::ops::Deref for RecordArtifactBodyRef {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<RecordArtifactBodyRef> for ::std::string::String {
        fn from(value: RecordArtifactBodyRef) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&RecordArtifactBodyRef> for RecordArtifactBodyRef {
        fn from(value: &RecordArtifactBodyRef) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for RecordArtifactBodyRef {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 2048usize {
                return Err("longer than 2048 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for RecordArtifactBodyRef {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for RecordArtifactBodyRef {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for RecordArtifactBodyRef {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for RecordArtifactBodyRef {
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
    ///`RecordArtifactResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "artifactId"
    ///  ],
    ///  "properties": {
    ///    "artifactId": {
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
    pub struct RecordArtifactResponse {
        #[serde(rename = "artifactId")]
        pub artifact_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&RecordArtifactResponse> for RecordArtifactResponse {
        fn from(value: &RecordArtifactResponse) -> Self {
            value.clone()
        }
    }
    ///`ResolveStopBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "resolution"
    ///  ],
    ///  "properties": {
    ///    "resolution": {
    ///      "$ref": "#/components/schemas/StopResolution"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ResolveStopBody {
        pub resolution: ::codm_contracts_rust::wire::enums::StopResolution,
    }
    impl ::std::convert::From<&ResolveStopBody> for ResolveStopBody {
        fn from(value: &ResolveStopBody) -> Self {
            value.clone()
        }
    }
    ///`SaveOnboardingStepBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "currentStep": {
    ///      "$ref": "#/components/schemas/OnboardingStep"
    ///    },
    ///    "state": {
    ///      "type": "object",
    ///      "properties": {
    ///        "contactRef": {
    ///          "type": "object",
    ///          "required": [
    ///            "channelId",
    ///            "displayName",
    ///            "externalId",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "channelId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "displayName": {
    ///              "type": "string",
    ///              "minLength": 1
    ///            },
    ///            "externalId": {
    ///              "type": "string",
    ///              "minLength": 1
    ///            },
    ///            "kind": {
    ///              "$ref": "#/components/schemas/ContactKind"
    ///            }
    ///          }
    ///        },
    ///        "providers": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/ProviderKind"
    ///          },
    ///          "minItems": 1
    ///        },
    ///        "workspace": {
    ///          "type": "object",
    ///          "properties": {
    ///            "existingWorkspaceId": {
    ///              "type": "string",
    ///              "format": "uuid",
    ///              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///            },
    ///            "path": {
    ///              "type": "string",
    ///              "maxLength": 1024,
    ///              "minLength": 1,
    ///              "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///            }
    ///          }
    ///        }
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SaveOnboardingStepBody {
        #[serde(
            rename = "currentStep",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub current_step: ::std::option::Option<
            ::codm_contracts_rust::wire::enums::OnboardingStep,
        >,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub state: ::std::option::Option<SaveOnboardingStepBodyState>,
    }
    impl ::std::convert::From<&SaveOnboardingStepBody> for SaveOnboardingStepBody {
        fn from(value: &SaveOnboardingStepBody) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for SaveOnboardingStepBody {
        fn default() -> Self {
            Self {
                current_step: Default::default(),
                state: Default::default(),
            }
        }
    }
    ///`SaveOnboardingStepBodyState`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "contactRef": {
    ///      "type": "object",
    ///      "required": [
    ///        "channelId",
    ///        "displayName",
    ///        "externalId",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "channelId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "displayName": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "externalId": {
    ///          "type": "string",
    ///          "minLength": 1
    ///        },
    ///        "kind": {
    ///          "$ref": "#/components/schemas/ContactKind"
    ///        }
    ///      }
    ///    },
    ///    "providers": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ProviderKind"
    ///      },
    ///      "minItems": 1
    ///    },
    ///    "workspace": {
    ///      "type": "object",
    ///      "properties": {
    ///        "existingWorkspaceId": {
    ///          "type": "string",
    ///          "format": "uuid",
    ///          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///        },
    ///        "path": {
    ///          "type": "string",
    ///          "maxLength": 1024,
    ///          "minLength": 1,
    ///          "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///        }
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SaveOnboardingStepBodyState {
        #[serde(
            rename = "contactRef",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub contact_ref: ::std::option::Option<SaveOnboardingStepBodyStateContactRef>,
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub providers: ::std::vec::Vec<::codm_contracts_rust::wire::enums::ProviderKind>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub workspace: ::std::option::Option<SaveOnboardingStepBodyStateWorkspace>,
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyState>
    for SaveOnboardingStepBodyState {
        fn from(value: &SaveOnboardingStepBodyState) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for SaveOnboardingStepBodyState {
        fn default() -> Self {
            Self {
                contact_ref: Default::default(),
                providers: Default::default(),
                workspace: Default::default(),
            }
        }
    }
    ///`SaveOnboardingStepBodyStateContactRef`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "displayName",
    ///    "externalId",
    ///    "kind"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "displayName": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "externalId": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    },
    ///    "kind": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SaveOnboardingStepBodyStateContactRef {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "displayName")]
        pub display_name: SaveOnboardingStepBodyStateContactRefDisplayName,
        #[serde(rename = "externalId")]
        pub external_id: SaveOnboardingStepBodyStateContactRefExternalId,
        pub kind: ::codm_contracts_rust::wire::enums::ContactKind,
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyStateContactRef>
    for SaveOnboardingStepBodyStateContactRef {
        fn from(value: &SaveOnboardingStepBodyStateContactRef) -> Self {
            value.clone()
        }
    }
    ///`SaveOnboardingStepBodyStateContactRefDisplayName`
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
    pub struct SaveOnboardingStepBodyStateContactRefDisplayName(::std::string::String);
    impl ::std::ops::Deref for SaveOnboardingStepBodyStateContactRefDisplayName {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SaveOnboardingStepBodyStateContactRefDisplayName>
    for ::std::string::String {
        fn from(value: SaveOnboardingStepBodyStateContactRefDisplayName) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyStateContactRefDisplayName>
    for SaveOnboardingStepBodyStateContactRefDisplayName {
        fn from(value: &SaveOnboardingStepBodyStateContactRefDisplayName) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SaveOnboardingStepBodyStateContactRefDisplayName {
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
    impl ::std::convert::TryFrom<&str>
    for SaveOnboardingStepBodyStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SaveOnboardingStepBodyStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SaveOnboardingStepBodyStateContactRefDisplayName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for SaveOnboardingStepBodyStateContactRefDisplayName {
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
    ///`SaveOnboardingStepBodyStateContactRefExternalId`
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
    pub struct SaveOnboardingStepBodyStateContactRefExternalId(::std::string::String);
    impl ::std::ops::Deref for SaveOnboardingStepBodyStateContactRefExternalId {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SaveOnboardingStepBodyStateContactRefExternalId>
    for ::std::string::String {
        fn from(value: SaveOnboardingStepBodyStateContactRefExternalId) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyStateContactRefExternalId>
    for SaveOnboardingStepBodyStateContactRefExternalId {
        fn from(value: &SaveOnboardingStepBodyStateContactRefExternalId) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SaveOnboardingStepBodyStateContactRefExternalId {
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
    impl ::std::convert::TryFrom<&str>
    for SaveOnboardingStepBodyStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SaveOnboardingStepBodyStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SaveOnboardingStepBodyStateContactRefExternalId {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de>
    for SaveOnboardingStepBodyStateContactRefExternalId {
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
    ///`SaveOnboardingStepBodyStateWorkspace`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "existingWorkspaceId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "path": {
    ///      "type": "string",
    ///      "maxLength": 1024,
    ///      "minLength": 1,
    ///      "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SaveOnboardingStepBodyStateWorkspace {
        #[serde(
            rename = "existingWorkspaceId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub existing_workspace_id: ::std::option::Option<::uuid::Uuid>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub path: ::std::option::Option<SaveOnboardingStepBodyStateWorkspacePath>,
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyStateWorkspace>
    for SaveOnboardingStepBodyStateWorkspace {
        fn from(value: &SaveOnboardingStepBodyStateWorkspace) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for SaveOnboardingStepBodyStateWorkspace {
        fn default() -> Self {
            Self {
                existing_workspace_id: Default::default(),
                path: Default::default(),
            }
        }
    }
    ///`SaveOnboardingStepBodyStateWorkspacePath`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "maxLength": 1024,
    ///  "minLength": 1,
    ///  "pattern": "^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct SaveOnboardingStepBodyStateWorkspacePath(::std::string::String);
    impl ::std::ops::Deref for SaveOnboardingStepBodyStateWorkspacePath {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SaveOnboardingStepBodyStateWorkspacePath>
    for ::std::string::String {
        fn from(value: SaveOnboardingStepBodyStateWorkspacePath) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SaveOnboardingStepBodyStateWorkspacePath>
    for SaveOnboardingStepBodyStateWorkspacePath {
        fn from(value: &SaveOnboardingStepBodyStateWorkspacePath) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SaveOnboardingStepBodyStateWorkspacePath {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 1024usize {
                return Err("longer than 1024 characters".into());
            }
            if value.chars().count() < 1usize {
                return Err("shorter than 1 characters".into());
            }
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^(?:\\/|[A-Za-z]:[\\\\/]|\\\\\\\\)\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for SaveOnboardingStepBodyStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for SaveOnboardingStepBodyStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for SaveOnboardingStepBodyStateWorkspacePath {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SaveOnboardingStepBodyStateWorkspacePath {
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
    ///`SendArtifactBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "caption": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendArtifactBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&SendArtifactBody> for SendArtifactBody {
        fn from(value: &SendArtifactBody) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for SendArtifactBody {
        fn default() -> Self {
            Self {
                caption: Default::default(),
            }
        }
    }
    ///`SendDirectMessageBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "text": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendDirectMessageBody {
        pub text: SendDirectMessageBodyText,
    }
    impl ::std::convert::From<&SendDirectMessageBody> for SendDirectMessageBody {
        fn from(value: &SendDirectMessageBody) -> Self {
            value.clone()
        }
    }
    ///`SendDirectMessageBodyText`
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
    pub struct SendDirectMessageBodyText(::std::string::String);
    impl ::std::ops::Deref for SendDirectMessageBodyText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SendDirectMessageBodyText> for ::std::string::String {
        fn from(value: SendDirectMessageBodyText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SendDirectMessageBodyText> for SendDirectMessageBodyText {
        fn from(value: &SendDirectMessageBodyText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SendDirectMessageBodyText {
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
    impl ::std::convert::TryFrom<&str> for SendDirectMessageBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SendDirectMessageBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SendDirectMessageBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SendDirectMessageBodyText {
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
    ///`SendDirectMessageResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "entryId"
    ///  ],
    ///  "properties": {
    ///    "entryId": {
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
    pub struct SendDirectMessageResponse {
        #[serde(rename = "entryId")]
        pub entry_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SendDirectMessageResponse> for SendDirectMessageResponse {
        fn from(value: &SendDirectMessageResponse) -> Self {
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
    ///`SetParticipantInvocationBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "canInvoke"
    ///  ],
    ///  "properties": {
    ///    "canInvoke": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SetParticipantInvocationBody {
        #[serde(rename = "canInvoke")]
        pub can_invoke: bool,
    }
    impl ::std::convert::From<&SetParticipantInvocationBody>
    for SetParticipantInvocationBody {
        fn from(value: &SetParticipantInvocationBody) -> Self {
            value.clone()
        }
    }
    ///`SetThreadLoopEnabledBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "enabled"
    ///  ],
    ///  "properties": {
    ///    "enabled": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SetThreadLoopEnabledBody {
        pub enabled: bool,
    }
    impl ::std::convert::From<&SetThreadLoopEnabledBody> for SetThreadLoopEnabledBody {
        fn from(value: &SetThreadLoopEnabledBody) -> Self {
            value.clone()
        }
    }
    ///`SetThreadLoopEnabledResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "nextRunAt": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SetThreadLoopEnabledResponse {
        #[serde(
            rename = "nextRunAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub next_run_at: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&SetThreadLoopEnabledResponse>
    for SetThreadLoopEnabledResponse {
        fn from(value: &SetThreadLoopEnabledResponse) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for SetThreadLoopEnabledResponse {
        fn default() -> Self {
            Self {
                next_run_at: Default::default(),
            }
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
    ///`SteerIssueBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "text": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SteerIssueBody {
        pub text: SteerIssueBodyText,
    }
    impl ::std::convert::From<&SteerIssueBody> for SteerIssueBody {
        fn from(value: &SteerIssueBody) -> Self {
            value.clone()
        }
    }
    ///`SteerIssueBodyText`
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
    pub struct SteerIssueBodyText(::std::string::String);
    impl ::std::ops::Deref for SteerIssueBodyText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SteerIssueBodyText> for ::std::string::String {
        fn from(value: SteerIssueBodyText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SteerIssueBodyText> for SteerIssueBodyText {
        fn from(value: &SteerIssueBodyText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SteerIssueBodyText {
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
    impl ::std::convert::TryFrom<&str> for SteerIssueBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SteerIssueBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SteerIssueBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SteerIssueBodyText {
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
    ///`SteerIssueResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "entryId"
    ///  ],
    ///  "properties": {
    ///    "entryId": {
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
    pub struct SteerIssueResponse {
        #[serde(rename = "entryId")]
        pub entry_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SteerIssueResponse> for SteerIssueResponse {
        fn from(value: &SteerIssueResponse) -> Self {
            value.clone()
        }
    }
    ///`SteerIssueTurnBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "text": {
    ///      "type": "string",
    ///      "maxLength": 2000,
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SteerIssueTurnBody {
        pub text: SteerIssueTurnBodyText,
    }
    impl ::std::convert::From<&SteerIssueTurnBody> for SteerIssueTurnBody {
        fn from(value: &SteerIssueTurnBody) -> Self {
            value.clone()
        }
    }
    ///`SteerIssueTurnBodyText`
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
    pub struct SteerIssueTurnBodyText(::std::string::String);
    impl ::std::ops::Deref for SteerIssueTurnBodyText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SteerIssueTurnBodyText> for ::std::string::String {
        fn from(value: SteerIssueTurnBodyText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SteerIssueTurnBodyText> for SteerIssueTurnBodyText {
        fn from(value: &SteerIssueTurnBodyText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SteerIssueTurnBodyText {
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
    impl ::std::convert::TryFrom<&str> for SteerIssueTurnBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SteerIssueTurnBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SteerIssueTurnBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SteerIssueTurnBodyText {
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
    ///`SteerIssueTurnResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "queued"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "queued": {
    ///      "type": "boolean"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct SteerIssueTurnResponse {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub queued: bool,
    }
    impl ::std::convert::From<&SteerIssueTurnResponse> for SteerIssueTurnResponse {
        fn from(value: &SteerIssueTurnResponse) -> Self {
            value.clone()
        }
    }
    ///`SteerThreadBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "text": {
    ///      "type": "string",
    ///      "minLength": 1
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SteerThreadBody {
        pub text: SteerThreadBodyText,
    }
    impl ::std::convert::From<&SteerThreadBody> for SteerThreadBody {
        fn from(value: &SteerThreadBody) -> Self {
            value.clone()
        }
    }
    ///`SteerThreadBodyText`
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
    pub struct SteerThreadBodyText(::std::string::String);
    impl ::std::ops::Deref for SteerThreadBodyText {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<SteerThreadBodyText> for ::std::string::String {
        fn from(value: SteerThreadBodyText) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&SteerThreadBodyText> for SteerThreadBodyText {
        fn from(value: &SteerThreadBodyText) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for SteerThreadBodyText {
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
    impl ::std::convert::TryFrom<&str> for SteerThreadBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for SteerThreadBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for SteerThreadBodyText {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for SteerThreadBodyText {
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
    ///`SteerThreadResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "entryId"
    ///  ],
    ///  "properties": {
    ///    "entryId": {
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
    pub struct SteerThreadResponse {
        #[serde(rename = "entryId")]
        pub entry_id: ::uuid::Uuid,
    }
    impl ::std::convert::From<&SteerThreadResponse> for SteerThreadResponse {
        fn from(value: &SteerThreadResponse) -> Self {
            value.clone()
        }
    }
    ///`Stream`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "stdout",
    ///    "stderr"
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
    pub enum Stream {
        #[serde(rename = "stdout")]
        Stdout,
        #[serde(rename = "stderr")]
        Stderr,
    }
    impl ::std::convert::From<&Self> for Stream {
        fn from(value: &Stream) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for Stream {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Stdout => f.write_str("stdout"),
                Self::Stderr => f.write_str("stderr"),
            }
        }
    }
    impl ::std::str::FromStr for Stream {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "stdout" => Ok(Self::Stdout),
                "stderr" => Ok(Self::Stderr),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for Stream {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for Stream {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for Stream {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`TransitionIssueStatusBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "key": {
    ///      "default": "",
    ///      "type": "string"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    },
    ///    "summary": {
    ///      "default": "",
    ///      "type": "string",
    ///      "maxLength": 4000
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct TransitionIssueStatusBody {
        #[serde(default)]
        pub key: ::std::string::String,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
        #[serde(default = "defaults::transition_issue_status_body_summary")]
        pub summary: TransitionIssueStatusBodySummary,
    }
    impl ::std::convert::From<&TransitionIssueStatusBody> for TransitionIssueStatusBody {
        fn from(value: &TransitionIssueStatusBody) -> Self {
            value.clone()
        }
    }
    ///`TransitionIssueStatusBodySummary`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "default": "",
    ///  "type": "string",
    ///  "maxLength": 4000
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct TransitionIssueStatusBodySummary(::std::string::String);
    impl ::std::ops::Deref for TransitionIssueStatusBodySummary {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<TransitionIssueStatusBodySummary>
    for ::std::string::String {
        fn from(value: TransitionIssueStatusBodySummary) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&TransitionIssueStatusBodySummary>
    for TransitionIssueStatusBodySummary {
        fn from(value: &TransitionIssueStatusBodySummary) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for TransitionIssueStatusBodySummary {
        fn default() -> Self {
            TransitionIssueStatusBodySummary("".to_string())
        }
    }
    impl ::std::str::FromStr for TransitionIssueStatusBodySummary {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            if value.chars().count() > 4000usize {
                return Err("longer than 4000 characters".into());
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for TransitionIssueStatusBodySummary {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for TransitionIssueStatusBodySummary {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for TransitionIssueStatusBodySummary {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for TransitionIssueStatusBodySummary {
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
    ///`TransitionIssueStatusResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "issueId",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "issueId": {
    ///      "type": "string",
    ///      "format": "uuid",
    ///      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/IssueStatus"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct TransitionIssueStatusResponse {
        #[serde(rename = "issueId")]
        pub issue_id: ::uuid::Uuid,
        pub status: ::codm_contracts_rust::wire::enums::IssueStatus,
    }
    impl ::std::convert::From<&TransitionIssueStatusResponse>
    for TransitionIssueStatusResponse {
        fn from(value: &TransitionIssueStatusResponse) -> Self {
            value.clone()
        }
    }
    ///`UpdateStopCriteriaBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "stopCriteria"
    ///  ],
    ///  "properties": {
    ///    "stopCriteria": {
    ///      "type": "object",
    ///      "required": [
    ///        "approvalNeeded",
    ///        "authRequired",
    ///        "blockedByClassification",
    ///        "humanRequested",
    ///        "serverErrors"
    ///      ],
    ///      "properties": {
    ///        "approvalNeeded": {
    ///          "type": "boolean"
    ///        },
    ///        "authRequired": {
    ///          "type": "boolean"
    ///        },
    ///        "blockedByClassification": {
    ///          "type": "boolean"
    ///        },
    ///        "humanRequested": {
    ///          "type": "boolean"
    ///        },
    ///        "serverErrors": {
    ///          "type": "boolean"
    ///        }
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UpdateStopCriteriaBody {
        #[serde(rename = "stopCriteria")]
        pub stop_criteria: UpdateStopCriteriaBodyStopCriteria,
    }
    impl ::std::convert::From<&UpdateStopCriteriaBody> for UpdateStopCriteriaBody {
        fn from(value: &UpdateStopCriteriaBody) -> Self {
            value.clone()
        }
    }
    ///`UpdateStopCriteriaBodyStopCriteria`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "approvalNeeded",
    ///    "authRequired",
    ///    "blockedByClassification",
    ///    "humanRequested",
    ///    "serverErrors"
    ///  ],
    ///  "properties": {
    ///    "approvalNeeded": {
    ///      "type": "boolean"
    ///    },
    ///    "authRequired": {
    ///      "type": "boolean"
    ///    },
    ///    "blockedByClassification": {
    ///      "type": "boolean"
    ///    },
    ///    "humanRequested": {
    ///      "type": "boolean"
    ///    },
    ///    "serverErrors": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UpdateStopCriteriaBodyStopCriteria {
        #[serde(rename = "approvalNeeded")]
        pub approval_needed: bool,
        #[serde(rename = "authRequired")]
        pub auth_required: bool,
        #[serde(rename = "blockedByClassification")]
        pub blocked_by_classification: bool,
        #[serde(rename = "humanRequested")]
        pub human_requested: bool,
        #[serde(rename = "serverErrors")]
        pub server_errors: bool,
    }
    impl ::std::convert::From<&UpdateStopCriteriaBodyStopCriteria>
    for UpdateStopCriteriaBodyStopCriteria {
        fn from(value: &UpdateStopCriteriaBodyStopCriteria) -> Self {
            value.clone()
        }
    }
    ///`UpdateThreadLoopBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "prompt",
    ///    "schedule"
    ///  ],
    ///  "properties": {
    ///    "prompt": {
    ///      "type": "string",
    ///      "maxLength": 2000,
    ///      "minLength": 1
    ///    },
    ///    "schedule": {
    ///      "oneOf": [
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "kind",
    ///            "timeOfDay",
    ///            "timezone",
    ///            "weekdays"
    ///          ],
    ///          "properties": {
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "DAILY"
    ///              ]
    ///            },
    ///            "timeOfDay": {
    ///              "type": "string",
    ///              "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///            },
    ///            "timezone": {
    ///              "$ref": "#/components/schemas/Timezone"
    ///            },
    ///            "weekdays": {
    ///              "type": "array",
    ///              "items": {
    ///                "$ref": "#/components/schemas/DayOfWeek"
    ///              },
    ///              "minItems": 1
    ///            }
    ///          }
    ///        },
    ///        {
    ///          "type": "object",
    ///          "required": [
    ///            "everyMinutes",
    ///            "kind"
    ///          ],
    ///          "properties": {
    ///            "everyMinutes": {
    ///              "type": "integer",
    ///              "maximum": 1440.0,
    ///              "minimum": 1.0
    ///            },
    ///            "kind": {
    ///              "type": "string",
    ///              "enum": [
    ///                "INTERVAL"
    ///              ]
    ///            }
    ///          }
    ///        }
    ///      ]
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UpdateThreadLoopBody {
        pub prompt: UpdateThreadLoopBodyPrompt,
        pub schedule: UpdateThreadLoopBodySchedule,
    }
    impl ::std::convert::From<&UpdateThreadLoopBody> for UpdateThreadLoopBody {
        fn from(value: &UpdateThreadLoopBody) -> Self {
            value.clone()
        }
    }
    ///`UpdateThreadLoopBodyPrompt`
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
    pub struct UpdateThreadLoopBodyPrompt(::std::string::String);
    impl ::std::ops::Deref for UpdateThreadLoopBodyPrompt {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<UpdateThreadLoopBodyPrompt> for ::std::string::String {
        fn from(value: UpdateThreadLoopBodyPrompt) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&UpdateThreadLoopBodyPrompt>
    for UpdateThreadLoopBodyPrompt {
        fn from(value: &UpdateThreadLoopBodyPrompt) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for UpdateThreadLoopBodyPrompt {
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
    impl ::std::convert::TryFrom<&str> for UpdateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for UpdateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for UpdateThreadLoopBodyPrompt {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for UpdateThreadLoopBodyPrompt {
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
    ///`UpdateThreadLoopBodySchedule`
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
    ///        "timeOfDay",
    ///        "timezone",
    ///        "weekdays"
    ///      ],
    ///      "properties": {
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "DAILY"
    ///          ]
    ///        },
    ///        "timeOfDay": {
    ///          "type": "string",
    ///          "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///        },
    ///        "timezone": {
    ///          "$ref": "#/components/schemas/Timezone"
    ///        },
    ///        "weekdays": {
    ///          "type": "array",
    ///          "items": {
    ///            "$ref": "#/components/schemas/DayOfWeek"
    ///          },
    ///          "minItems": 1
    ///        }
    ///      }
    ///    },
    ///    {
    ///      "type": "object",
    ///      "required": [
    ///        "everyMinutes",
    ///        "kind"
    ///      ],
    ///      "properties": {
    ///        "everyMinutes": {
    ///          "type": "integer",
    ///          "maximum": 1440.0,
    ///          "minimum": 1.0
    ///        },
    ///        "kind": {
    ///          "type": "string",
    ///          "enum": [
    ///            "INTERVAL"
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
    pub enum UpdateThreadLoopBodySchedule {
        #[serde(rename = "DAILY")]
        Daily {
            #[serde(rename = "timeOfDay")]
            time_of_day: UpdateThreadLoopBodyScheduleTimeOfDay,
            timezone: ::codm_contracts_rust::wire::enums::Timezone,
            weekdays: ::std::vec::Vec<::codm_contracts_rust::wire::enums::DayOfWeek>,
        },
        #[serde(rename = "INTERVAL")]
        Interval {
            #[serde(rename = "everyMinutes")]
            every_minutes: ::std::num::NonZeroU64,
        },
    }
    impl ::std::convert::From<&Self> for UpdateThreadLoopBodySchedule {
        fn from(value: &UpdateThreadLoopBodySchedule) -> Self {
            value.clone()
        }
    }
    ///`UpdateThreadLoopBodyScheduleTimeOfDay`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    #[serde(transparent)]
    pub struct UpdateThreadLoopBodyScheduleTimeOfDay(::std::string::String);
    impl ::std::ops::Deref for UpdateThreadLoopBodyScheduleTimeOfDay {
        type Target = ::std::string::String;
        fn deref(&self) -> &::std::string::String {
            &self.0
        }
    }
    impl ::std::convert::From<UpdateThreadLoopBodyScheduleTimeOfDay>
    for ::std::string::String {
        fn from(value: UpdateThreadLoopBodyScheduleTimeOfDay) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&UpdateThreadLoopBodyScheduleTimeOfDay>
    for UpdateThreadLoopBodyScheduleTimeOfDay {
        fn from(value: &UpdateThreadLoopBodyScheduleTimeOfDay) -> Self {
            value.clone()
        }
    }
    impl ::std::str::FromStr for UpdateThreadLoopBodyScheduleTimeOfDay {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(||
            { ::regress::Regex::new("^([01]\\d|2[0-3]):[0-5]\\d$").unwrap() });
            if PATTERN.find(value).is_none() {
                return Err(
                    "doesn't match pattern \"^([01]\\d|2[0-3]):[0-5]\\d$\"".into(),
                );
            }
            Ok(Self(value.to_string()))
        }
    }
    impl ::std::convert::TryFrom<&str> for UpdateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String>
    for UpdateThreadLoopBodyScheduleTimeOfDay {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl<'de> ::serde::Deserialize<'de> for UpdateThreadLoopBodyScheduleTimeOfDay {
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
    ///`UpdateThreadLoopResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "nextRunAt": {
    ///      "type": "string"
    ///    }
    ///  },
    ///  "additionalProperties": false
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(deny_unknown_fields)]
    pub struct UpdateThreadLoopResponse {
        #[serde(
            rename = "nextRunAt",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub next_run_at: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&UpdateThreadLoopResponse> for UpdateThreadLoopResponse {
        fn from(value: &UpdateThreadLoopResponse) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for UpdateThreadLoopResponse {
        fn default() -> Self {
            Self {
                next_run_at: Default::default(),
            }
        }
    }
    /// Generation of default values for serde.
    pub mod defaults {
        pub(super) fn transition_issue_status_body_summary() -> super::TransitionIssueStatusBodySummary {
            super::TransitionIssueStatusBodySummary("".to_string())
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
    /**All issues across every thread, grouped by status (T04)

Sends a `GET` request to `/issues`

*/
    pub async fn get_issues_overview<'a>(
        &'a self,
        include_archived: Option<bool>,
    ) -> Result<ResponseValue<types::GetIssuesOverviewResponse>, Error<()>> {
        let url = format!("{}/issues", self.baseurl,);
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
            .query(
                &progenitor_client::QueryParam::new("includeArchived", &include_archived),
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
    /**One issue drill-down: terminal log, routed messages, stops (T12)

Sends a `GET` request to `/issues/{issueId}`

*/
    pub async fn get_issue_detail<'a>(
        &'a self,
        issue_id: &'a str,
    ) -> Result<ResponseValue<types::GetIssueDetailResponse>, Error<()>> {
        let url = format!(
            "{}/issues/{}", self.baseurl, encode_path(& issue_id.to_string()),
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
    /**Archive an issue (C26)

Sends a `POST` request to `/issues/{issueId}/archive`

*/
    pub async fn archive_issue<'a>(
        &'a self,
        issue_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/issues/{}/archive", self.baseurl, encode_path(& issue_id.to_string()),
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
    /**Restore an archived issue (C27)

Sends a `POST` request to `/issues/{issueId}/restore`

*/
    pub async fn restore_issue<'a>(
        &'a self,
        issue_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/issues/{}/restore", self.baseurl, encode_path(& issue_id.to_string()),
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
    /**Whisper a steer scoped to one issue (C22)

Sends a `POST` request to `/issues/{issueId}/steer`

*/
    pub async fn steer_issue<'a>(
        &'a self,
        issue_id: &'a str,
        body: &'a types::SteerIssueBody,
    ) -> Result<ResponseValue<types::SteerIssueResponse>, Error<()>> {
        let url = format!(
            "{}/issues/{}/steer", self.baseurl, encode_path(& issue_id.to_string()),
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
    /**Update the global stop-criteria toggles (C29)

Sends a `PUT` request to `/settings/stop-criteria`

*/
    pub async fn update_stop_criteria<'a>(
        &'a self,
        body: &'a types::UpdateStopCriteriaBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/settings/stop-criteria", self.baseurl,);
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
    /**Resolve a stop — retry / review&send / take over / approve / deny (C25)

Sends a `POST` request to `/stops/{stopId}/resolve`

*/
    pub async fn resolve_stop<'a>(
        &'a self,
        stop_id: &'a str,
        body: &'a types::ResolveStopBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/stops/{}/resolve", self.baseurl, encode_path(& stop_id.to_string()),
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
    /**Detected agent provider CLIs (claude-code / codex / opencode) with binary path, version, install status and whether a runner exists for them yet (comingSoon)

Sends a `GET` request to `/terminal/providers`

*/
    pub async fn detect_providers<'a>(
        &'a self,
        refresh: Option<bool>,
    ) -> Result<ResponseValue<types::DetectProvidersResponse>, Error<()>> {
        let url = format!("{}/terminal/providers", self.baseurl,);
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
            .query(&progenitor_client::QueryParam::new("refresh", &refresh))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Live terminal output for an issue session via Server-Sent Events (browser.terminal_output_appended)

Sends a `GET` request to `/terminal/sessions/{issueId}/stream`

*/
    pub async fn stream_terminal_session<'a>(
        &'a self,
        issue_id: &'a str,
    ) -> Result<ResponseValue<ByteStream>, Error<()>> {
        let url = format!(
            "{}/terminal/sessions/{}/stream", self.baseurl, encode_path(& issue_id
            .to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self.client.get(url).headers(header_map).build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => Ok(ResponseValue::stream(response)),
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Attach a contact/group to a workspace + providers (C09)

Sends a `POST` request to `/threads`

*/
    pub async fn attach_thread<'a>(
        &'a self,
        body: &'a types::AttachThreadBody,
    ) -> Result<ResponseValue<types::AttachThreadResponse>, Error<()>> {
        let url = format!("{}/threads", self.baseurl,);
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
    /**Apagar uma conversa configurada — soft delete, bloqueado por trabalho vivo (C-DEL)

Sends a `DELETE` request to `/threads/{threadId}`

*/
    pub async fn delete_thread<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}", self.baseurl, encode_path(& thread_id.to_string()),
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
            .delete(url)
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
    /**The non-code outputs of a thread (T13)

Sends a `GET` request to `/threads/{threadId}/artifacts`

*/
    pub async fn list_artifacts<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::ListArtifactsResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/artifacts", self.baseurl, encode_path(& thread_id
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
    /**Record a non-code agent output (image / file / link) (C30)

Sends a `POST` request to `/threads/{threadId}/artifacts`

*/
    pub async fn record_artifact<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::RecordArtifactBody,
    ) -> Result<ResponseValue<types::RecordArtifactResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/artifacts", self.baseurl, encode_path(& thread_id
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
    /**The bytes of one recorded artifact, for the console preview

Sends a `GET` request to `/threads/{threadId}/artifacts/{artifactId}/content`

*/
    pub async fn get_artifact_content<'a>(
        &'a self,
        thread_id: &'a str,
        artifact_id: &'a str,
    ) -> Result<ResponseValue<ByteStream>, Error<()>> {
        let url = format!(
            "{}/threads/{}/artifacts/{}/content", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& artifact_id.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self.client.get(url).headers(header_map).build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => Ok(ResponseValue::stream(response)),
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Deliver an already-recorded artifact to the contact on the channel

Sends a `POST` request to `/threads/{threadId}/artifacts/{artifactId}/send`

*/
    pub async fn send_artifact<'a>(
        &'a self,
        thread_id: &'a str,
        artifact_id: &'a str,
        body: &'a types::SendArtifactBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/artifacts/{}/send", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& artifact_id.to_string()),
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
    /**Set the rolling context-buffer size {25,50,100,200} (C14)

Sends a `PUT` request to `/threads/{threadId}/buffer`

*/
    pub async fn configure_context_buffer<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureContextBufferBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/buffer", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Full thread conversation + control-plane state + active stops (T09)

Sends a `GET` request to `/threads/{threadId}/chat`

*/
    pub async fn get_session_chat<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::GetSessionChatResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/chat", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Send a direct message as the operator (only while paused) (C20)

Sends a `POST` request to `/threads/{threadId}/direct`

*/
    pub async fn send_direct_message<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::SendDirectMessageBody,
    ) -> Result<ResponseValue<types::SendDirectMessageResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/direct", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Issues of one thread grouped by status + auto-archive note (T11)

Sends a `GET` request to `/threads/{threadId}/issues`

*/
    pub async fn get_session_issues<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::GetSessionIssuesResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Open a new issue on a thread

Sends a `POST` request to `/threads/{threadId}/issues`

*/
    pub async fn create_issue<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::CreateIssueBody,
    ) -> Result<ResponseValue<types::CreateIssueResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Fork a new issue out of the conversation, from the operator's own words

Sends a `POST` request to `/threads/{threadId}/issues/fork`

*/
    pub async fn fork_issue<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ForkIssueBody,
    ) -> Result<ResponseValue<types::ForkIssueResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/fork", self.baseurl, encode_path(& thread_id
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
    /**Ask the operator a question (fire-and-forget; surfaces as a Needs-you stop)

Sends a `POST` request to `/threads/{threadId}/issues/{issueId}/operator-questions`

*/
    pub async fn ask_operator<'a>(
        &'a self,
        thread_id: &'a str,
        issue_id: &'a str,
        body: &'a types::AskOperatorBody,
    ) -> Result<ResponseValue<types::AskOperatorResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/{}/operator-questions", self.baseurl, encode_path(&
            thread_id.to_string()), encode_path(& issue_id.to_string()),
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
    /**Status of one issue of this thread

Sends a `GET` request to `/threads/{threadId}/issues/{issueId}/status`

*/
    pub async fn get_issue_status<'a>(
        &'a self,
        thread_id: &'a str,
        issue_id: &'a str,
    ) -> Result<ResponseValue<types::GetIssueStatusResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/{}/status", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& issue_id.to_string()),
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
    /**Declare the lifecycle status of an issue (done / needs input)

Sends a `POST` request to `/threads/{threadId}/issues/{issueId}/status`

*/
    pub async fn transition_issue_status<'a>(
        &'a self,
        thread_id: &'a str,
        issue_id: &'a str,
        body: &'a types::TransitionIssueStatusBody,
    ) -> Result<ResponseValue<types::TransitionIssueStatusResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/{}/status", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& issue_id.to_string()),
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
    /**Redirect an issue of this thread — including one that already finished

Sends a `POST` request to `/threads/{threadId}/issues/{issueId}/steer`

*/
    pub async fn steer_issue_turn<'a>(
        &'a self,
        thread_id: &'a str,
        issue_id: &'a str,
        body: &'a types::SteerIssueTurnBody,
    ) -> Result<ResponseValue<types::SteerIssueTurnResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/{}/steer", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& issue_id.to_string()),
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
    /**Declare that the agent is blocked and needs the human (approval, classification, …)

Sends a `POST` request to `/threads/{threadId}/issues/{issueId}/stops`

*/
    pub async fn raise_stop<'a>(
        &'a self,
        thread_id: &'a str,
        issue_id: &'a str,
        body: &'a types::RaiseStopBody,
    ) -> Result<ResponseValue<types::RaiseStopResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/issues/{}/stops", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& issue_id.to_string()),
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
    /**This conversation's scheduled prompts (loops) (T11)

Sends a `GET` request to `/threads/{threadId}/loops`

*/
    pub async fn list_thread_loops<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::ListThreadLoopsResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/loops", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Schedule a recurring whisper into this conversation (C21)

Sends a `POST` request to `/threads/{threadId}/loops`

*/
    pub async fn create_thread_loop<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::CreateThreadLoopBody,
    ) -> Result<ResponseValue<types::CreateThreadLoopResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/loops", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Edit a loop — its prompt and its schedule (C22)

Sends a `PUT` request to `/threads/{threadId}/loops/{loopId}`

*/
    pub async fn update_thread_loop<'a>(
        &'a self,
        thread_id: &'a str,
        loop_id: &'a str,
        body: &'a types::UpdateThreadLoopBody,
    ) -> Result<ResponseValue<types::UpdateThreadLoopResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/loops/{}", self.baseurl, encode_path(& thread_id.to_string()),
            encode_path(& loop_id.to_string()),
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
    /**Remove a loop (C24)

Sends a `DELETE` request to `/threads/{threadId}/loops/{loopId}`

*/
    pub async fn delete_thread_loop<'a>(
        &'a self,
        thread_id: &'a str,
        loop_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/loops/{}", self.baseurl, encode_path(& thread_id.to_string()),
            encode_path(& loop_id.to_string()),
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
            .delete(url)
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
    /**Pause or resume a loop (C23)

Sends a `PUT` request to `/threads/{threadId}/loops/{loopId}/enabled`

*/
    pub async fn set_thread_loop_enabled<'a>(
        &'a self,
        thread_id: &'a str,
        loop_id: &'a str,
        body: &'a types::SetThreadLoopEnabledBody,
    ) -> Result<ResponseValue<types::SetThreadLoopEnabledResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/loops/{}/enabled", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& loop_id.to_string()),
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
    /**Configure the mention gate (respond only when a @tag is written) (C12)

Sends a `PUT` request to `/threads/{threadId}/mention-gate`

*/
    pub async fn configure_mention_gate<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureMentionGateBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/mention-gate", self.baseurl, encode_path(& thread_id
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
    /**Choose which model this conversation asks one of its agent CLIs for. DEFAULT means let the CLI pick (C16)

Sends a `PUT` request to `/threads/{threadId}/model`

*/
    pub async fn configure_model<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureModelBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/model", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Active stops on a thread with per-kind resolution actions (T14)

Sends a `GET` request to `/threads/{threadId}/needs-you`

*/
    pub async fn get_needs_you_panel<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::GetNeedsYouPanelResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/needs-you", self.baseurl, encode_path(& thread_id
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
    /**Toggle whether a participant may invoke agents (C13)

Sends a `PUT` request to `/threads/{threadId}/participants/{participantId}`

*/
    pub async fn set_participant_invocation<'a>(
        &'a self,
        thread_id: &'a str,
        participant_id: &'a str,
        body: &'a types::SetParticipantInvocationBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/participants/{}", self.baseurl, encode_path(& thread_id
            .to_string()), encode_path(& participant_id.to_string()),
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
    /**Pause all agent activity on a thread (C10)

Sends a `POST` request to `/threads/{threadId}/pause`

*/
    pub async fn pause_thread<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/pause", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Set (or clear, with an empty body value) the operator's custom prompt for this conversation (C15)

Sends a `PUT` request to `/threads/{threadId}/prompt`

*/
    pub async fn configure_prompt<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigurePromptBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/prompt", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Turn the 👀/🤖 channel reaction cues on or off for this conversation

Sends a `PUT` request to `/threads/{threadId}/reactions`

*/
    pub async fn configure_reactions<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureReactionsBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/reactions", self.baseurl, encode_path(& thread_id
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
    /**Resume agent activity on a thread (C11)

Sends a `POST` request to `/threads/{threadId}/resume`

*/
    pub async fn resume_thread<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/resume", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Per-thread behavior: mention gate, participants + invocation, buffer size (T10)

Sends a `GET` request to `/threads/{threadId}/settings`

*/
    pub async fn get_thread_settings<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> Result<ResponseValue<types::GetThreadSettingsResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/settings", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Whisper a steer into the thread (agents-only; never sent to the channel) (C19)

Sends a `POST` request to `/threads/{threadId}/steer`

*/
    pub async fn steer_thread<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::SteerThreadBody,
    ) -> Result<ResponseValue<types::SteerThreadResponse>, Error<()>> {
        let url = format!(
            "{}/threads/{}/steer", self.baseurl, encode_path(& thread_id.to_string()),
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
    /**Turn intermediate content cuts on or off for this conversation

Sends a `PUT` request to `/threads/{threadId}/streaming`

*/
    pub async fn configure_streaming<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureStreamingBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/streaming", self.baseurl, encode_path(& thread_id
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
    /**Turn the "Pensando" channel placeholder on or off for this conversation

Sends a `PUT` request to `/threads/{threadId}/thinking-indicator`

*/
    pub async fn configure_thinking_indicator<'a>(
        &'a self,
        thread_id: &'a str,
        body: &'a types::ConfigureThinkingIndicatorBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/threads/{}/thinking-indicator", self.baseurl, encode_path(& thread_id
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
    /**Account settings read

Sends a `GET` request to `/ui/account`

*/
    pub async fn get_my_account<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetMyAccountResponse>, Error<()>> {
        let url = format!("{}/ui/account", self.baseurl,);
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
    /**Attach-thread wizard — contacts, workspaces, providers + attached/no-channel flags (T15)

Sends a `GET` request to `/ui/attach-thread-wizard`

*/
    pub async fn get_attach_thread_wizard<'a>(
        &'a self,
        cursor: Option<&'a str>,
        search: Option<&'a str>,
    ) -> Result<ResponseValue<types::GetAttachThreadWizardResponse>, Error<()>> {
        let url = format!("{}/ui/attach-thread-wizard", self.baseurl,);
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
            .query(&progenitor_client::QueryParam::new("cursor", &cursor))
            .query(&progenitor_client::QueryParam::new("search", &search))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**The photo of one channel contact, cached daemon-side (the console renders it in chat bubbles and rosters)

Sends a `GET` request to `/ui/avatars/{channelId}/{remoteId}`

*/
    pub async fn get_contact_avatar<'a>(
        &'a self,
        channel_id: &'a str,
        remote_id: &'a str,
    ) -> Result<ResponseValue<ByteStream>, Error<()>> {
        let url = format!(
            "{}/ui/avatars/{}/{}", self.baseurl, encode_path(& channel_id.to_string()),
            encode_path(& remote_id.to_string()),
        );
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self.client.get(url).headers(header_map).build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => Ok(ResponseValue::stream(response)),
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Owner-scoped real-time integration events via SSE

Sends a `GET` request to `/ui/events`

*/
    pub async fn listen_events<'a>(
        &'a self,
    ) -> Result<ResponseValue<ByteStream>, Error<()>> {
        let url = format!("{}/ui/events", self.baseurl,);
        let mut header_map = ::reqwest::header::HeaderMap::with_capacity(1usize);
        header_map
            .append(
                ::reqwest::header::HeaderName::from_static("api-version"),
                ::reqwest::header::HeaderValue::from_static(self.api_version()),
            );
        #[allow(unused_mut)]
        let mut request = self.client.get(url).headers(header_map).build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => Ok(ResponseValue::stream(response)),
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Home dashboard — agents running, needs-you, active sessions, today metrics, channels (T03)

Sends a `GET` request to `/ui/home`

*/
    pub async fn get_home_dashboard<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetHomeDashboardResponse>, Error<()>> {
        let url = format!("{}/ui/home", self.baseurl,);
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
    /**Onboarding — jornada persistida (currentStep/completedAt/state) + satisfação derivada dos passos de setup

Sends a `GET` request to `/ui/onboarding`

*/
    pub async fn get_onboarding<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetOnboardingResponse>, Error<()>> {
        let url = format!("{}/ui/onboarding", self.baseurl,);
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
    /**Conclui o onboarding do operador — commit atômico do rascunho (workspace/thread) seguido de completedAt

Sends a `POST` request to `/ui/onboarding/complete`

*/
    pub async fn complete_onboarding<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::CompleteOnboardingResponse>, Error<()>> {
        let url = format!("{}/ui/onboarding/complete", self.baseurl,);
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
    /**Salva onde o operador parou no wizard e/ou o rascunho (contactRef/workspace/providers) acumulado até aqui

Sends a `PATCH` request to `/ui/onboarding/step`

*/
    pub async fn save_onboarding_step<'a>(
        &'a self,
        body: &'a types::SaveOnboardingStepBody,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!("{}/ui/onboarding/step", self.baseurl,);
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
    /**The operator's displayed identity — name and photo borrowed from the connected channel's own account

Sends a `GET` request to `/ui/operator`

*/
    pub async fn get_operator_identity<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetOperatorIdentityResponse>, Error<()>> {
        let url = format!("{}/ui/operator", self.baseurl,);
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
    /**Settings — providers, stop criteria, general, app version (T08)

Sends a `GET` request to `/ui/settings`

*/
    pub async fn get_settings<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetSettingsResponse>, Error<()>> {
        let url = format!("{}/ui/settings", self.baseurl,);
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
    /**Header context — user identity, all member owners (role), active owner, and profile alerts

Sends a `GET` request to `/ui/user-info`

*/
    pub async fn get_user_info<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::GetUserInfoResponse>, Error<()>> {
        let url = format!("{}/ui/user-info", self.baseurl,);
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
    /**List registered workspaces with badges and thread counts (T07)

Sends a `GET` request to `/workspaces`

*/
    pub async fn list_workspaces<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::ListWorkspacesResponse>, Error<()>> {
        let url = format!("{}/workspaces", self.baseurl,);
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
    /**Register a local project folder; auto-detects git / Claude-project badges

Sends a `POST` request to `/workspaces`

*/
    pub async fn add_workspace<'a>(
        &'a self,
        body: &'a types::AddWorkspaceBody,
    ) -> Result<ResponseValue<types::AddWorkspaceResponse>, Error<()>> {
        let url = format!("{}/workspaces", self.baseurl,);
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
    /**Remove a registered workspace (refused while an issue is WORKING on it)

Sends a `DELETE` request to `/workspaces/{workspaceId}`

*/
    pub async fn remove_workspace<'a>(
        &'a self,
        workspace_id: &'a str,
    ) -> Result<ResponseValue<::serde_json::Value>, Error<()>> {
        let url = format!(
            "{}/workspaces/{}", self.baseurl, encode_path(& workspace_id.to_string()),
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
            .delete(url)
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
}
/// Items consumers will typically use such as the Client.
pub mod prelude {
    #[allow(unused_imports)]
    pub use super::Client;
}
