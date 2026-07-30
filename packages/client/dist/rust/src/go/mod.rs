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
    ///`ArchiveRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ArchiveRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ArchiveRemoteBody> for ArchiveRemoteBody {
        fn from(value: &ArchiveRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`AudioMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "fileLength": {
    ///      "type": "integer"
    ///    },
    ///    "mimetype": {
    ///      "type": "string"
    ///    },
    ///    "ptt": {
    ///      "type": "boolean"
    ///    },
    ///    "seconds": {
    ///      "type": "integer"
    ///    },
    ///    "url": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct AudioMessageData {
        #[serde(
            rename = "fileLength",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_length: ::std::option::Option<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub mimetype: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub ptt: ::std::option::Option<bool>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub seconds: ::std::option::Option<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub url: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&AudioMessageData> for AudioMessageData {
        fn from(value: &AudioMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for AudioMessageData {
        fn default() -> Self {
            Self {
                file_length: Default::default(),
                mimetype: Default::default(),
                ptt: Default::default(),
                seconds: Default::default(),
                url: Default::default(),
            }
        }
    }
    ///`ButtonItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "buttonId",
    ///    "displayText"
    ///  ],
    ///  "properties": {
    ///    "buttonId": {
    ///      "examples": [
    ///        "btn-1"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "displayText": {
    ///      "examples": [
    ///        "Yes"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ButtonItem {
        #[serde(rename = "buttonId")]
        pub button_id: ::std::string::String,
        #[serde(rename = "displayText")]
        pub display_text: ::std::string::String,
    }
    impl ::std::convert::From<&ButtonItem> for ButtonItem {
        fn from(value: &ButtonItem) -> Self {
            value.clone()
        }
    }
    ///`ChannelChatPresenceUpdatedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "chatId",
    ///    "observedAt",
    ///    "ownerId",
    ///    "senderId",
    ///    "state"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "chatId": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "state": {
    ///      "$ref": "#/components/schemas/ChatPresenceType"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelChatPresenceUpdatedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "chatId")]
        pub chat_id: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub state: ::codedm_contracts_rust::wire::enums::ChatPresenceType,
    }
    impl ::std::convert::From<&ChannelChatPresenceUpdatedPayload>
    for ChannelChatPresenceUpdatedPayload {
        fn from(value: &ChannelChatPresenceUpdatedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelConnectedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "ownerId",
    ///    "platform"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "x-unknown": true
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelConnectedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<::serde_json::Value>,
    }
    impl ::std::convert::From<&ChannelConnectedPayload> for ChannelConnectedPayload {
        fn from(value: &ChannelConnectedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelCreatedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "name",
    ///    "ownerId",
    ///    "platform"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelCreatedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
    }
    impl ::std::convert::From<&ChannelCreatedPayload> for ChannelCreatedPayload {
        fn from(value: &ChannelCreatedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelDisconnectedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "ownerId",
    ///    "platform"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "x-unknown": true
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelDisconnectedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<::serde_json::Value>,
    }
    impl ::std::convert::From<&ChannelDisconnectedPayload>
    for ChannelDisconnectedPayload {
        fn from(value: &ChannelDisconnectedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelChannelCreated"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelGatewayConnected"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelGatewayDisconnected"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageSent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageReceived"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageEdited"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageDeleted"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageDelivered"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessageSeen"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemotePinned"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteUnpinned"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteArchived"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteUnarchived"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteMuted"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteUnmuted"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteMarkedAsUnread"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteChatSeen"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteUpdated"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteCreated"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemoteDeleted"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelRemotesSynced"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMessagesSynced"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMembershipAdded"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelEvent_ChannelMembershipRemoved"
    ///    }
    ///  ],
    ///  "x-discriminators": [
    ///    "name"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum ChannelEvent {
        ChannelCreated(ChannelEventChannelChannelCreated),
        GatewayConnected(ChannelEventChannelGatewayConnected),
        GatewayDisconnected(ChannelEventChannelGatewayDisconnected),
        MessageSent(ChannelEventChannelMessageSent),
        MessageReceived(ChannelEventChannelMessageReceived),
        MessageEdited(ChannelEventChannelMessageEdited),
        MessageDeleted(ChannelEventChannelMessageDeleted),
        MessageDelivered(ChannelEventChannelMessageDelivered),
        MessageSeen(ChannelEventChannelMessageSeen),
        RemotePinned(ChannelEventChannelRemotePinned),
        RemoteUnpinned(ChannelEventChannelRemoteUnpinned),
        RemoteArchived(ChannelEventChannelRemoteArchived),
        RemoteUnarchived(ChannelEventChannelRemoteUnarchived),
        RemoteMuted(ChannelEventChannelRemoteMuted),
        RemoteUnmuted(ChannelEventChannelRemoteUnmuted),
        RemoteMarkedAsUnread(ChannelEventChannelRemoteMarkedAsUnread),
        RemoteChatSeen(ChannelEventChannelRemoteChatSeen),
        RemoteUpdated(ChannelEventChannelRemoteUpdated),
        RemoteCreated(ChannelEventChannelRemoteCreated),
        RemoteDeleted(ChannelEventChannelRemoteDeleted),
        RemotesSynced(ChannelEventChannelRemotesSynced),
        MessagesSynced(ChannelEventChannelMessagesSynced),
        MembershipAdded(ChannelEventChannelMembershipAdded),
        MembershipRemoved(ChannelEventChannelMembershipRemoved),
    }
    impl ::std::convert::From<&Self> for ChannelEvent {
        fn from(value: &ChannelEvent) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<ChannelEventChannelChannelCreated> for ChannelEvent {
        fn from(value: ChannelEventChannelChannelCreated) -> Self {
            Self::ChannelCreated(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelGatewayConnected> for ChannelEvent {
        fn from(value: ChannelEventChannelGatewayConnected) -> Self {
            Self::GatewayConnected(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelGatewayDisconnected> for ChannelEvent {
        fn from(value: ChannelEventChannelGatewayDisconnected) -> Self {
            Self::GatewayDisconnected(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageSent> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageSent) -> Self {
            Self::MessageSent(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageReceived> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageReceived) -> Self {
            Self::MessageReceived(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageEdited> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageEdited) -> Self {
            Self::MessageEdited(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageDeleted> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageDeleted) -> Self {
            Self::MessageDeleted(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageDelivered> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageDelivered) -> Self {
            Self::MessageDelivered(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessageSeen> for ChannelEvent {
        fn from(value: ChannelEventChannelMessageSeen) -> Self {
            Self::MessageSeen(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemotePinned> for ChannelEvent {
        fn from(value: ChannelEventChannelRemotePinned) -> Self {
            Self::RemotePinned(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteUnpinned> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteUnpinned) -> Self {
            Self::RemoteUnpinned(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteArchived> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteArchived) -> Self {
            Self::RemoteArchived(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteUnarchived> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteUnarchived) -> Self {
            Self::RemoteUnarchived(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteMuted> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteMuted) -> Self {
            Self::RemoteMuted(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteUnmuted> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteUnmuted) -> Self {
            Self::RemoteUnmuted(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteMarkedAsUnread> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteMarkedAsUnread) -> Self {
            Self::RemoteMarkedAsUnread(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteChatSeen> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteChatSeen) -> Self {
            Self::RemoteChatSeen(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteUpdated> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteUpdated) -> Self {
            Self::RemoteUpdated(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteCreated> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteCreated) -> Self {
            Self::RemoteCreated(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemoteDeleted> for ChannelEvent {
        fn from(value: ChannelEventChannelRemoteDeleted) -> Self {
            Self::RemoteDeleted(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelRemotesSynced> for ChannelEvent {
        fn from(value: ChannelEventChannelRemotesSynced) -> Self {
            Self::RemotesSynced(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMessagesSynced> for ChannelEvent {
        fn from(value: ChannelEventChannelMessagesSynced) -> Self {
            Self::MessagesSynced(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMembershipAdded> for ChannelEvent {
        fn from(value: ChannelEventChannelMembershipAdded) -> Self {
            Self::MembershipAdded(value)
        }
    }
    impl ::std::convert::From<ChannelEventChannelMembershipRemoved> for ChannelEvent {
        fn from(value: ChannelEventChannelMembershipRemoved) -> Self {
            Self::MembershipRemoved(value)
        }
    }
    ///`ChannelEventChannelChannelCreated`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelCreatedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelChannelCreated {
        pub name: ::std::string::String,
        pub payload: ChannelCreatedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelChannelCreated>
    for ChannelEventChannelChannelCreated {
        fn from(value: &ChannelEventChannelChannelCreated) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelGatewayConnected`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelConnectedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelGatewayConnected {
        pub name: ::std::string::String,
        pub payload: ChannelConnectedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelGatewayConnected>
    for ChannelEventChannelGatewayConnected {
        fn from(value: &ChannelEventChannelGatewayConnected) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelGatewayDisconnected`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelDisconnectedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelGatewayDisconnected {
        pub name: ::std::string::String,
        pub payload: ChannelDisconnectedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelGatewayDisconnected>
    for ChannelEventChannelGatewayDisconnected {
        fn from(value: &ChannelEventChannelGatewayDisconnected) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMembershipAdded`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMembershipAddedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMembershipAdded {
        pub name: ::std::string::String,
        pub payload: ChannelMembershipAddedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMembershipAdded>
    for ChannelEventChannelMembershipAdded {
        fn from(value: &ChannelEventChannelMembershipAdded) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMembershipRemoved`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMembershipRemovedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMembershipRemoved {
        pub name: ::std::string::String,
        pub payload: ChannelMembershipRemovedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMembershipRemoved>
    for ChannelEventChannelMembershipRemoved {
        fn from(value: &ChannelEventChannelMembershipRemoved) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageDeleted`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageDeletedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageDeleted {
        pub name: ::std::string::String,
        pub payload: ChannelMessageDeletedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageDeleted>
    for ChannelEventChannelMessageDeleted {
        fn from(value: &ChannelEventChannelMessageDeleted) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageDelivered`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageDeliveredPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageDelivered {
        pub name: ::std::string::String,
        pub payload: ChannelMessageDeliveredPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageDelivered>
    for ChannelEventChannelMessageDelivered {
        fn from(value: &ChannelEventChannelMessageDelivered) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageEdited`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageEditedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageEdited {
        pub name: ::std::string::String,
        pub payload: ChannelMessageEditedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageEdited>
    for ChannelEventChannelMessageEdited {
        fn from(value: &ChannelEventChannelMessageEdited) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageReceived`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageReceived {
        pub name: ::std::string::String,
        pub payload: ChannelMessageReceivedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageReceived>
    for ChannelEventChannelMessageReceived {
        fn from(value: &ChannelEventChannelMessageReceived) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageSeen`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageSeenPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageSeen {
        pub name: ::std::string::String,
        pub payload: ChannelMessageSeenPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageSeen>
    for ChannelEventChannelMessageSeen {
        fn from(value: &ChannelEventChannelMessageSeen) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessageSent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessageSent {
        pub name: ::std::string::String,
        pub payload: ChannelMessageSentPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessageSent>
    for ChannelEventChannelMessageSent {
        fn from(value: &ChannelEventChannelMessageSent) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelMessagesSynced`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessagesSyncedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelMessagesSynced {
        pub name: ::std::string::String,
        pub payload: ChannelMessagesSyncedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelMessagesSynced>
    for ChannelEventChannelMessagesSynced {
        fn from(value: &ChannelEventChannelMessagesSynced) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteArchived`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteArchivedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteArchived {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteArchivedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteArchived>
    for ChannelEventChannelRemoteArchived {
        fn from(value: &ChannelEventChannelRemoteArchived) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteChatSeen`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteChatSeenPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteChatSeen {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteChatSeenPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteChatSeen>
    for ChannelEventChannelRemoteChatSeen {
        fn from(value: &ChannelEventChannelRemoteChatSeen) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteCreated`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteCreatedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteCreated {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteCreatedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteCreated>
    for ChannelEventChannelRemoteCreated {
        fn from(value: &ChannelEventChannelRemoteCreated) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteDeleted`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteDeletedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteDeleted {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteDeletedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteDeleted>
    for ChannelEventChannelRemoteDeleted {
        fn from(value: &ChannelEventChannelRemoteDeleted) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteMarkedAsUnread`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteMarkedAsUnreadPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteMarkedAsUnread {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteMarkedAsUnreadPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteMarkedAsUnread>
    for ChannelEventChannelRemoteMarkedAsUnread {
        fn from(value: &ChannelEventChannelRemoteMarkedAsUnread) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteMuted`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteMutedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteMuted {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteMutedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteMuted>
    for ChannelEventChannelRemoteMuted {
        fn from(value: &ChannelEventChannelRemoteMuted) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemotePinned`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemotePinnedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemotePinned {
        pub name: ::std::string::String,
        pub payload: ChannelRemotePinnedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemotePinned>
    for ChannelEventChannelRemotePinned {
        fn from(value: &ChannelEventChannelRemotePinned) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteUnarchived`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteUnarchivedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteUnarchived {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteUnarchivedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteUnarchived>
    for ChannelEventChannelRemoteUnarchived {
        fn from(value: &ChannelEventChannelRemoteUnarchived) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteUnmuted`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteUnmutedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteUnmuted {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteUnmutedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteUnmuted>
    for ChannelEventChannelRemoteUnmuted {
        fn from(value: &ChannelEventChannelRemoteUnmuted) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteUnpinned`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteUnpinnedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteUnpinned {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteUnpinnedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteUnpinned>
    for ChannelEventChannelRemoteUnpinned {
        fn from(value: &ChannelEventChannelRemoteUnpinned) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemoteUpdated`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteUpdatedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemoteUpdated {
        pub name: ::std::string::String,
        pub payload: ChannelRemoteUpdatedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemoteUpdated>
    for ChannelEventChannelRemoteUpdated {
        fn from(value: &ChannelEventChannelRemoteUpdated) -> Self {
            value.clone()
        }
    }
    ///`ChannelEventChannelRemotesSynced`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "name",
    ///    "payload"
    ///  ],
    ///  "properties": {
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemotesSyncedPayload"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelEventChannelRemotesSynced {
        pub name: ::std::string::String,
        pub payload: ChannelRemotesSyncedPayload,
    }
    impl ::std::convert::From<&ChannelEventChannelRemotesSynced>
    for ChannelEventChannelRemotesSynced {
        fn from(value: &ChannelEventChannelRemotesSynced) -> Self {
            value.clone()
        }
    }
    ///`ChannelLoggedOutPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "ownerId",
    ///    "platform",
    ///    "reason"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "x-unknown": true
    ///    },
    ///    "reason": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelLoggedOutPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<::serde_json::Value>,
        pub reason: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelLoggedOutPayload> for ChannelLoggedOutPayload {
        fn from(value: &ChannelLoggedOutPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMembershipAddedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "groupId",
    ///    "isAdmin",
    ///    "joinedAt",
    ///    "memberId",
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "groupId": {
    ///      "type": "string"
    ///    },
    ///    "isAdmin": {
    ///      "type": "boolean"
    ///    },
    ///    "joinedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "memberId": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMembershipAddedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "groupId")]
        pub group_id: ::std::string::String,
        #[serde(rename = "isAdmin")]
        pub is_admin: bool,
        #[serde(rename = "joinedAt")]
        pub joined_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "memberId")]
        pub member_id: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelMembershipAddedPayload>
    for ChannelMembershipAddedPayload {
        fn from(value: &ChannelMembershipAddedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMembershipRemovedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "groupId",
    ///    "memberId",
    ///    "ownerId",
    ///    "removedAt"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "groupId": {
    ///      "type": "string"
    ///    },
    ///    "memberId": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "removedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMembershipRemovedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "groupId")]
        pub group_id: ::std::string::String,
        #[serde(rename = "memberId")]
        pub member_id: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "removedAt")]
        pub removed_at: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&ChannelMembershipRemovedPayload>
    for ChannelMembershipRemovedPayload {
        fn from(value: &ChannelMembershipRemovedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageDeletedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageDeletedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelMessageDeletedPayload>
    for ChannelMessageDeletedPayload {
        fn from(value: &ChannelMessageDeletedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageDeliveredPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageIds",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "messageIds": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "string"
    ///      }
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageDeliveredPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "messageIds")]
        pub message_ids: ::std::vec::Vec<::std::string::String>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageDeliveredPayload>
    for ChannelMessageDeliveredPayload {
        fn from(value: &ChannelMessageDeliveredPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageEditedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "messageType",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "x-unknown": true
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "$ref": "#/components/schemas/MessageType"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageEditedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<::serde_json::Value>,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::codedm_contracts_rust::wire::enums::MessageType,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageEditedPayload>
    for ChannelMessageEditedPayload {
        fn from(value: &ChannelMessageEditedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Text"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Image"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Video"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Audio"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Document"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Sticker"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Location"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Contact"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Poll"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Whatsapp_Reaction"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload_Internal_Text"
    ///    }
    ///  ],
    ///  "x-discriminators": [
    ///    "platform",
    ///    "messageType"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum ChannelMessageReceivedPayload {
        WhatsappText(ChannelMessageReceivedPayloadWhatsappText),
        WhatsappImage(ChannelMessageReceivedPayloadWhatsappImage),
        WhatsappVideo(ChannelMessageReceivedPayloadWhatsappVideo),
        WhatsappAudio(ChannelMessageReceivedPayloadWhatsappAudio),
        WhatsappDocument(ChannelMessageReceivedPayloadWhatsappDocument),
        WhatsappSticker(ChannelMessageReceivedPayloadWhatsappSticker),
        WhatsappLocation(ChannelMessageReceivedPayloadWhatsappLocation),
        WhatsappContact(ChannelMessageReceivedPayloadWhatsappContact),
        WhatsappPoll(ChannelMessageReceivedPayloadWhatsappPoll),
        WhatsappReaction(ChannelMessageReceivedPayloadWhatsappReaction),
        InternalText(ChannelMessageReceivedPayloadInternalText),
    }
    impl ::std::convert::From<&Self> for ChannelMessageReceivedPayload {
        fn from(value: &ChannelMessageReceivedPayload) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappText>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappText) -> Self {
            Self::WhatsappText(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappImage>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappImage) -> Self {
            Self::WhatsappImage(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappVideo>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappVideo) -> Self {
            Self::WhatsappVideo(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappAudio>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappAudio) -> Self {
            Self::WhatsappAudio(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappDocument>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappDocument) -> Self {
            Self::WhatsappDocument(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappSticker>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappSticker) -> Self {
            Self::WhatsappSticker(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappLocation>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappLocation) -> Self {
            Self::WhatsappLocation(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappContact>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappContact) -> Self {
            Self::WhatsappContact(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappPoll>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappPoll) -> Self {
            Self::WhatsappPoll(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadWhatsappReaction>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadWhatsappReaction) -> Self {
            Self::WhatsappReaction(value)
        }
    }
    impl ::std::convert::From<ChannelMessageReceivedPayloadInternalText>
    for ChannelMessageReceivedPayload {
        fn from(value: ChannelMessageReceivedPayloadInternalText) -> Self {
            Self::InternalText(value)
        }
    }
    ///`ChannelMessageReceivedPayloadInternalText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/InternalTextContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/InternalChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadInternalText {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<InternalTextContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            InternalChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadInternalText>
    for ChannelMessageReceivedPayloadInternalText {
        fn from(value: &ChannelMessageReceivedPayloadInternalText) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappAudio`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppAudioContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappAudio {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppAudioContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappAudio>
    for ChannelMessageReceivedPayloadWhatsappAudio {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappAudio) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappContact`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppContactContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappContact {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppContactContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappContact>
    for ChannelMessageReceivedPayloadWhatsappContact {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappContact) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappDocument`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppDocumentContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappDocument {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppDocumentContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappDocument>
    for ChannelMessageReceivedPayloadWhatsappDocument {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappDocument) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappImage`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppImageContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappImage {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppImageContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappImage>
    for ChannelMessageReceivedPayloadWhatsappImage {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappImage) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappLocation`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppLocationContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappLocation {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppLocationContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappLocation>
    for ChannelMessageReceivedPayloadWhatsappLocation {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappLocation) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappPoll`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppPollContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappPoll {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppPollContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappPoll>
    for ChannelMessageReceivedPayloadWhatsappPoll {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappPoll) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappReaction`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppReactionContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappReaction {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppReactionContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappReaction>
    for ChannelMessageReceivedPayloadWhatsappReaction {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappReaction) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappSticker`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppStickerContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappSticker {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppStickerContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappSticker>
    for ChannelMessageReceivedPayloadWhatsappSticker {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappSticker) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppTextContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappText {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppTextContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappText>
    for ChannelMessageReceivedPayloadWhatsappText {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappText) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageReceivedPayloadWhatsappVideo`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "author",
    ///    "channelId",
    ///    "fromMe",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "author": {
    ///      "$ref": "#/components/schemas/MessageAuthor"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppVideoContent"
    ///    },
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageReceivedPayloadWhatsappVideo {
        pub author: ::codedm_contracts_rust::wire::enums::MessageAuthor,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppVideoContent>,
        #[serde(rename = "fromMe")]
        pub from_me: bool,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageReceivedPayloadWhatsappVideo>
    for ChannelMessageReceivedPayloadWhatsappVideo {
        fn from(value: &ChannelMessageReceivedPayloadWhatsappVideo) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSeenPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageIds",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "self",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "messageIds": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "string"
    ///      }
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "self": {
    ///      "type": "boolean"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSeenPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "messageIds")]
        pub message_ids: ::std::vec::Vec<::std::string::String>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "self")]
        pub self_: bool,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSeenPayload> for ChannelMessageSeenPayload {
        fn from(value: &ChannelMessageSeenPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Text"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Image"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Video"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Audio"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Document"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Sticker"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Location"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Contact"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Poll"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Whatsapp_Reaction"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/ChannelMessageSentPayload_Internal_Text"
    ///    }
    ///  ],
    ///  "x-discriminators": [
    ///    "platform",
    ///    "messageType"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum ChannelMessageSentPayload {
        WhatsappText(ChannelMessageSentPayloadWhatsappText),
        WhatsappImage(ChannelMessageSentPayloadWhatsappImage),
        WhatsappVideo(ChannelMessageSentPayloadWhatsappVideo),
        WhatsappAudio(ChannelMessageSentPayloadWhatsappAudio),
        WhatsappDocument(ChannelMessageSentPayloadWhatsappDocument),
        WhatsappSticker(ChannelMessageSentPayloadWhatsappSticker),
        WhatsappLocation(ChannelMessageSentPayloadWhatsappLocation),
        WhatsappContact(ChannelMessageSentPayloadWhatsappContact),
        WhatsappPoll(ChannelMessageSentPayloadWhatsappPoll),
        WhatsappReaction(ChannelMessageSentPayloadWhatsappReaction),
        InternalText(ChannelMessageSentPayloadInternalText),
    }
    impl ::std::convert::From<&Self> for ChannelMessageSentPayload {
        fn from(value: &ChannelMessageSentPayload) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappText>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappText) -> Self {
            Self::WhatsappText(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappImage>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappImage) -> Self {
            Self::WhatsappImage(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappVideo>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappVideo) -> Self {
            Self::WhatsappVideo(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappAudio>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappAudio) -> Self {
            Self::WhatsappAudio(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappDocument>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappDocument) -> Self {
            Self::WhatsappDocument(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappSticker>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappSticker) -> Self {
            Self::WhatsappSticker(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappLocation>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappLocation) -> Self {
            Self::WhatsappLocation(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappContact>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappContact) -> Self {
            Self::WhatsappContact(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappPoll>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappPoll) -> Self {
            Self::WhatsappPoll(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadWhatsappReaction>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadWhatsappReaction) -> Self {
            Self::WhatsappReaction(value)
        }
    }
    impl ::std::convert::From<ChannelMessageSentPayloadInternalText>
    for ChannelMessageSentPayload {
        fn from(value: ChannelMessageSentPayloadInternalText) -> Self {
            Self::InternalText(value)
        }
    }
    ///`ChannelMessageSentPayloadInternalText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/InternalTextContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/InternalChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadInternalText {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<InternalTextContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<InternalChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadInternalText>
    for ChannelMessageSentPayloadInternalText {
        fn from(value: &ChannelMessageSentPayloadInternalText) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappAudio`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppAudioContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappAudio {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppAudioContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappAudio>
    for ChannelMessageSentPayloadWhatsappAudio {
        fn from(value: &ChannelMessageSentPayloadWhatsappAudio) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappContact`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppContactContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappContact {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppContactContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappContact>
    for ChannelMessageSentPayloadWhatsappContact {
        fn from(value: &ChannelMessageSentPayloadWhatsappContact) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappDocument`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppDocumentContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappDocument {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppDocumentContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappDocument>
    for ChannelMessageSentPayloadWhatsappDocument {
        fn from(value: &ChannelMessageSentPayloadWhatsappDocument) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappImage`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppImageContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappImage {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppImageContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappImage>
    for ChannelMessageSentPayloadWhatsappImage {
        fn from(value: &ChannelMessageSentPayloadWhatsappImage) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappLocation`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppLocationContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappLocation {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppLocationContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappLocation>
    for ChannelMessageSentPayloadWhatsappLocation {
        fn from(value: &ChannelMessageSentPayloadWhatsappLocation) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappPoll`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppPollContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappPoll {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppPollContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappPoll>
    for ChannelMessageSentPayloadWhatsappPoll {
        fn from(value: &ChannelMessageSentPayloadWhatsappPoll) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappReaction`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppReactionContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappReaction {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppReactionContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappReaction>
    for ChannelMessageSentPayloadWhatsappReaction {
        fn from(value: &ChannelMessageSentPayloadWhatsappReaction) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappSticker`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppStickerContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappSticker {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppStickerContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappSticker>
    for ChannelMessageSentPayloadWhatsappSticker {
        fn from(value: &ChannelMessageSentPayloadWhatsappSticker) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappText`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppTextContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappText {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppTextContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappText>
    for ChannelMessageSentPayloadWhatsappText {
        fn from(value: &ChannelMessageSentPayloadWhatsappText) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessageSentPayloadWhatsappVideo`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "internalMessageId",
    ///    "isGroup",
    ///    "messageId",
    ///    "messageType",
    ///    "observedAt",
    ///    "occurredAt",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "senderId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "content": {
    ///      "$ref": "#/components/schemas/WhatsAppVideoContent"
    ///    },
    ///    "internalMessageId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "messageType": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "occurredAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    },
    ///    "platformData": {
    ///      "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "senderId": {
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessageSentPayloadWhatsappVideo {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub content: ::std::option::Option<WhatsAppVideoContent>,
        #[serde(rename = "internalMessageId")]
        pub internal_message_id: ::uuid::Uuid,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "messageType")]
        pub message_type: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "occurredAt")]
        pub occurred_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::std::string::String,
        #[serde(
            rename = "platformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub platform_data: ::std::option::Option<WhatsAppChannelMessageSentPlatformData>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "senderId")]
        pub sender_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ChannelMessageSentPayloadWhatsappVideo>
    for ChannelMessageSentPayloadWhatsappVideo {
        fn from(value: &ChannelMessageSentPayloadWhatsappVideo) -> Self {
            value.clone()
        }
    }
    ///`ChannelMessagesSyncedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "inserted",
    ///    "ownerId",
    ///    "total"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "inserted": {
    ///      "type": "integer"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "total": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelMessagesSyncedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        pub inserted: i64,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub total: i64,
    }
    impl ::std::convert::From<&ChannelMessagesSyncedPayload>
    for ChannelMessagesSyncedPayload {
        fn from(value: &ChannelMessagesSyncedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelPresenceUpdatedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "observedAt",
    ///    "ownerId",
    ///    "remoteId",
    ///    "unavailable"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "lastSeen": {
    ///      "type": [
    ///        "integer",
    ///        "null"
    ///      ]
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "unavailable": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelPresenceUpdatedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(
            rename = "lastSeen",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub last_seen: ::std::option::Option<i64>,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        pub unavailable: bool,
    }
    impl ::std::convert::From<&ChannelPresenceUpdatedPayload>
    for ChannelPresenceUpdatedPayload {
        fn from(value: &ChannelPresenceUpdatedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteArchivedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteArchivedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteArchivedPayload>
    for ChannelRemoteArchivedPayload {
        fn from(value: &ChannelRemoteArchivedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteChatSeenPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "lastReadMessageId": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteChatSeenPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(
            rename = "lastReadMessageId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub last_read_message_id: ::std::option::Option<::std::string::String>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteChatSeenPayload>
    for ChannelRemoteChatSeenPayload {
        fn from(value: &ChannelRemoteChatSeenPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteCreatedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "ownerId",
    ///    "platform",
    ///    "remoteId",
    ///    "remoteType"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "remoteType": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteCreatedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "remoteType")]
        pub remote_type: ::codedm_contracts_rust::wire::enums::ContactKind,
    }
    impl ::std::convert::From<&ChannelRemoteCreatedPayload>
    for ChannelRemoteCreatedPayload {
        fn from(value: &ChannelRemoteCreatedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteDeletedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteDeletedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteDeletedPayload>
    for ChannelRemoteDeletedPayload {
        fn from(value: &ChannelRemoteDeletedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteMarkedAsUnreadPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteMarkedAsUnreadPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteMarkedAsUnreadPayload>
    for ChannelRemoteMarkedAsUnreadPayload {
        fn from(value: &ChannelRemoteMarkedAsUnreadPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteMutedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "mutedUntil": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ],
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteMutedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(
            rename = "mutedUntil",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub muted_until: ::std::option::Option<
            ::chrono::DateTime<::chrono::offset::Utc>,
        >,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteMutedPayload> for ChannelRemoteMutedPayload {
        fn from(value: &ChannelRemoteMutedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemotePinnedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemotePinnedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemotePinnedPayload>
    for ChannelRemotePinnedPayload {
        fn from(value: &ChannelRemotePinnedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteUnarchivedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteUnarchivedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteUnarchivedPayload>
    for ChannelRemoteUnarchivedPayload {
        fn from(value: &ChannelRemoteUnarchivedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteUnmutedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteUnmutedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteUnmutedPayload>
    for ChannelRemoteUnmutedPayload {
        fn from(value: &ChannelRemoteUnmutedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteUnpinnedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "at",
    ///    "channelId",
    ///    "ownerId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "at": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteUnpinnedPayload {
        pub at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelRemoteUnpinnedPayload>
    for ChannelRemoteUnpinnedPayload {
        fn from(value: &ChannelRemoteUnpinnedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemoteUpdatedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "name",
    ///    "observedAt",
    ///    "ownerId",
    ///    "remoteId",
    ///    "type"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "description": {
    ///      "type": [
    ///        "string",
    ///        "null"
    ///      ]
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "observedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "type": {
    ///      "$ref": "#/components/schemas/ContactKind"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemoteUpdatedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub description: ::std::option::Option<::std::string::String>,
        pub name: ::std::string::String,
        #[serde(rename = "observedAt")]
        pub observed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "type")]
        pub type_: ::codedm_contracts_rust::wire::enums::ContactKind,
    }
    impl ::std::convert::From<&ChannelRemoteUpdatedPayload>
    for ChannelRemoteUpdatedPayload {
        fn from(value: &ChannelRemoteUpdatedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelRemotesSyncedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "inserted",
    ///    "ownerId",
    ///    "total"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "inserted": {
    ///      "type": "integer"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "total": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelRemotesSyncedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        pub inserted: i64,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub total: i64,
    }
    impl ::std::convert::From<&ChannelRemotesSyncedPayload>
    for ChannelRemotesSyncedPayload {
        fn from(value: &ChannelRemotesSyncedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelSpecialPlatformEventReceivedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "$ref": "#/components/schemas/ChannelSpecialPlatformEventReceivedPayload_Whatsapp_QrCodeUpdated"
    ///    }
    ///  ],
    ///  "x-discriminators": [
    ///    "platform",
    ///    "eventType"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(transparent)]
    pub struct ChannelSpecialPlatformEventReceivedPayload(
        pub ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated,
    );
    impl ::std::ops::Deref for ChannelSpecialPlatformEventReceivedPayload {
        type Target = ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated;
        fn deref(
            &self,
        ) -> &ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated {
            &self.0
        }
    }
    impl ::std::convert::From<ChannelSpecialPlatformEventReceivedPayload>
    for ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated {
        fn from(value: ChannelSpecialPlatformEventReceivedPayload) -> Self {
            value.0
        }
    }
    impl ::std::convert::From<&ChannelSpecialPlatformEventReceivedPayload>
    for ChannelSpecialPlatformEventReceivedPayload {
        fn from(value: &ChannelSpecialPlatformEventReceivedPayload) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<
        ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated,
    > for ChannelSpecialPlatformEventReceivedPayload {
        fn from(
            value: ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated,
        ) -> Self {
            Self(value)
        }
    }
    ///`ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "eventName",
    ///    "eventType",
    ///    "ownerId",
    ///    "payload",
    ///    "platform"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "eventName": {
    ///      "type": "string"
    ///    },
    ///    "eventType": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/WhatsAppQRCodeUpdated"
    ///    },
    ///    "platform": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "eventName")]
        pub event_name: ::std::string::String,
        #[serde(rename = "eventType")]
        pub event_type: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: WhatsAppQrCodeUpdated,
        pub platform: ::std::string::String,
    }
    impl ::std::convert::From<
        &ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated,
    > for ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated {
        fn from(
            value: &ChannelSpecialPlatformEventReceivedPayloadWhatsappQrCodeUpdated,
        ) -> Self {
            value.clone()
        }
    }
    ///`ChannelSyncCompletedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "completedAt",
    ///    "ownerId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "completedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelSyncCompletedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "completedAt")]
        pub completed_at: ::chrono::DateTime<::chrono::offset::Utc>,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
    }
    impl ::std::convert::From<&ChannelSyncCompletedPayload>
    for ChannelSyncCompletedPayload {
        fn from(value: &ChannelSyncCompletedPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelSyncProgressPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "historySyncType",
    ///    "ownerId",
    ///    "percent"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "historySyncType": {
    ///      "$ref": "#/components/schemas/HistorySyncType"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "percent": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelSyncProgressPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "historySyncType")]
        pub history_sync_type: ::codedm_contracts_rust::wire::enums::HistorySyncType,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub percent: i64,
    }
    impl ::std::convert::From<&ChannelSyncProgressPayload>
    for ChannelSyncProgressPayload {
        fn from(value: &ChannelSyncProgressPayload) -> Self {
            value.clone()
        }
    }
    ///`ChannelSyncStartedPayload`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "ownerId",
    ///    "startedAt"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "type": "string",
    ///      "format": "uuid"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "startedAt": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ChannelSyncStartedPayload {
        #[serde(rename = "channelId")]
        pub channel_id: ::uuid::Uuid,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        #[serde(rename = "startedAt")]
        pub started_at: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&ChannelSyncStartedPayload> for ChannelSyncStartedPayload {
        fn from(value: &ChannelSyncStartedPayload) -> Self {
            value.clone()
        }
    }
    ///`CheckIsOnPlatformBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "identifiers"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "identifiers": {
    ///      "examples": [
    ///        "5511999999999"
    ///      ],
    ///      "type": "array",
    ///      "items": {
    ///        "type": "string"
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CheckIsOnPlatformBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub identifiers: ::std::vec::Vec<::std::string::String>,
    }
    impl ::std::convert::From<&CheckIsOnPlatformBody> for CheckIsOnPlatformBody {
        fn from(value: &CheckIsOnPlatformBody) -> Self {
            value.clone()
        }
    }
    ///`CheckIsOnPlatformOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "results"
    ///  ],
    ///  "properties": {
    ///    "results": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ContactCheck"
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CheckIsOnPlatformOutput {
        pub results: ::std::vec::Vec<ContactCheck>,
    }
    impl ::std::convert::From<&CheckIsOnPlatformOutput> for CheckIsOnPlatformOutput {
        fn from(value: &CheckIsOnPlatformOutput) -> Self {
            value.clone()
        }
    }
    ///`ConnectChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "state"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "qrCode": {
    ///      "examples": [
    ///        "2@ABC123..."
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "state": {
    ///      "examples": [
    ///        "CONNECTING"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ConnectChannelOutput {
        pub id: ::std::string::String,
        #[serde(
            rename = "qrCode",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub qr_code: ::std::option::Option<::std::string::String>,
        pub state: ::std::string::String,
    }
    impl ::std::convert::From<&ConnectChannelOutput> for ConnectChannelOutput {
        fn from(value: &ConnectChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`ConnectionStatus`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "CONNECTED",
    ///    "DISCONNECTED",
    ///    "CONNECTING"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "ConnectionStatusConnected",
    ///    "ConnectionStatusDisconnected",
    ///    "ConnectionStatusConnecting"
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
    pub enum ConnectionStatus {
        #[serde(rename = "CONNECTED")]
        Connected,
        #[serde(rename = "DISCONNECTED")]
        Disconnected,
        #[serde(rename = "CONNECTING")]
        Connecting,
    }
    impl ::std::convert::From<&Self> for ConnectionStatus {
        fn from(value: &ConnectionStatus) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ConnectionStatus {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Connected => f.write_str("CONNECTED"),
                Self::Disconnected => f.write_str("DISCONNECTED"),
                Self::Connecting => f.write_str("CONNECTING"),
            }
        }
    }
    impl ::std::str::FromStr for ConnectionStatus {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "CONNECTED" => Ok(Self::Connected),
                "DISCONNECTED" => Ok(Self::Disconnected),
                "CONNECTING" => Ok(Self::Connecting),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ConnectionStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ConnectionStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ConnectionStatus {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`ContactCheck`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "identifier",
    ///    "isOnPlatform",
    ///    "platformId"
    ///  ],
    ///  "properties": {
    ///    "identifier": {
    ///      "examples": [
    ///        "5511999999999"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "isOnPlatform": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    },
    ///    "platformId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ContactCheck {
        pub identifier: ::std::string::String,
        #[serde(rename = "isOnPlatform")]
        pub is_on_platform: bool,
        #[serde(rename = "platformId")]
        pub platform_id: ::std::string::String,
    }
    impl ::std::convert::From<&ContactCheck> for ContactCheck {
        fn from(value: &ContactCheck) -> Self {
            value.clone()
        }
    }
    ///`ContactData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "fullName",
    ///    "phoneNumber"
    ///  ],
    ///  "properties": {
    ///    "email": {
    ///      "type": "string"
    ///    },
    ///    "fullName": {
    ///      "type": "string"
    ///    },
    ///    "organization": {
    ///      "type": "string"
    ///    },
    ///    "phoneNumber": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ContactData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub email: ::std::option::Option<::std::string::String>,
        #[serde(rename = "fullName")]
        pub full_name: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub organization: ::std::option::Option<::std::string::String>,
        #[serde(rename = "phoneNumber")]
        pub phone_number: ::std::string::String,
    }
    impl ::std::convert::From<&ContactData> for ContactData {
        fn from(value: &ContactData) -> Self {
            value.clone()
        }
    }
    ///`ContactInfo`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "fullName",
    ///    "phoneNumber"
    ///  ],
    ///  "properties": {
    ///    "email": {
    ///      "examples": [
    ///        "john@example.com"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "fullName": {
    ///      "examples": [
    ///        "John Doe"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "organization": {
    ///      "examples": [
    ///        "Acme Corp"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "phoneNumber": {
    ///      "examples": [
    ///        "5511999999999"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ContactInfo {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub email: ::std::option::Option<::std::string::String>,
        #[serde(rename = "fullName")]
        pub full_name: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub organization: ::std::option::Option<::std::string::String>,
        #[serde(rename = "phoneNumber")]
        pub phone_number: ::std::string::String,
    }
    impl ::std::convert::From<&ContactInfo> for ContactInfo {
        fn from(value: &ContactInfo) -> Self {
            value.clone()
        }
    }
    ///`ContactMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "displayName": {
    ///      "type": "string"
    ///    },
    ///    "vcard": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ContactMessageData {
        #[serde(
            rename = "displayName",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub display_name: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub vcard: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&ContactMessageData> for ContactMessageData {
        fn from(value: &ContactMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for ContactMessageData {
        fn default() -> Self {
            Self {
                display_name: Default::default(),
                vcard: Default::default(),
            }
        }
    }
    ///`CreateChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "createdAt",
    ///    "id",
    ///    "name",
    ///    "platform",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "createdAt": {
    ///      "examples": [
    ///        "2026-02-19T10:30:00Z"
    ///      ],
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "examples": [
    ///        "my-channel"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ChannelStatus"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CreateChannelOutput {
        #[serde(rename = "createdAt")]
        pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        pub status: ::codedm_contracts_rust::wire::enums::ChannelStatus,
    }
    impl ::std::convert::From<&CreateChannelOutput> for CreateChannelOutput {
        fn from(value: &CreateChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`CreateWhatsAppChannelBody`
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
    ///      "examples": [
    ///        "My WhatsApp"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct CreateWhatsAppChannelBody {
        pub name: ::std::string::String,
    }
    impl ::std::convert::From<&CreateWhatsAppChannelBody> for CreateWhatsAppChannelBody {
        fn from(value: &CreateWhatsAppChannelBody) -> Self {
            value.clone()
        }
    }
    ///`DeleteChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct DeleteChannelOutput {
        pub id: ::std::string::String,
    }
    impl ::std::convert::From<&DeleteChannelOutput> for DeleteChannelOutput {
        fn from(value: &DeleteChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`DeleteMessageBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct DeleteMessageBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&DeleteMessageBody> for DeleteMessageBody {
        fn from(value: &DeleteMessageBody) -> Self {
            value.clone()
        }
    }
    ///`DeleteMessageOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "success"
    ///  ],
    ///  "properties": {
    ///    "success": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct DeleteMessageOutput {
        pub success: bool,
    }
    impl ::std::convert::From<&DeleteMessageOutput> for DeleteMessageOutput {
        fn from(value: &DeleteMessageOutput) -> Self {
            value.clone()
        }
    }
    ///`DocumentMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "caption": {
    ///      "type": "string"
    ///    },
    ///    "fileLength": {
    ///      "type": "integer"
    ///    },
    ///    "fileName": {
    ///      "type": "string"
    ///    },
    ///    "jpegThumbnail": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "integer"
    ///      }
    ///    },
    ///    "mimetype": {
    ///      "type": "string"
    ///    },
    ///    "url": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct DocumentMessageData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "fileLength",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_length: ::std::option::Option<i64>,
        #[serde(
            rename = "fileName",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_name: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "jpegThumbnail",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub jpeg_thumbnail: ::std::vec::Vec<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub mimetype: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub url: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&DocumentMessageData> for DocumentMessageData {
        fn from(value: &DocumentMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for DocumentMessageData {
        fn default() -> Self {
            Self {
                caption: Default::default(),
                file_length: Default::default(),
                file_name: Default::default(),
                jpeg_thumbnail: Default::default(),
                mimetype: Default::default(),
                url: Default::default(),
            }
        }
    }
    ///`EditMessageBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "remoteId",
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "text": {
    ///      "examples": [
    ///        "Edited message text"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct EditMessageBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&EditMessageBody> for EditMessageBody {
        fn from(value: &EditMessageBody) -> Self {
            value.clone()
        }
    }
    ///`EditMessageOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "success"
    ///  ],
    ///  "properties": {
    ///    "success": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct EditMessageOutput {
        pub success: bool,
    }
    impl ::std::convert::From<&EditMessageOutput> for EditMessageOutput {
        fn from(value: &EditMessageOutput) -> Self {
            value.clone()
        }
    }
    ///`Environment`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "DEVELOPMENT",
    ///    "STAGING",
    ///    "PRODUCTION"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "EnvironmentDevelopment",
    ///    "EnvironmentStaging",
    ///    "EnvironmentProduction"
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
    pub enum Environment {
        #[serde(rename = "DEVELOPMENT")]
        Development,
        #[serde(rename = "STAGING")]
        Staging,
        #[serde(rename = "PRODUCTION")]
        Production,
    }
    impl ::std::convert::From<&Self> for Environment {
        fn from(value: &Environment) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for Environment {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Development => f.write_str("DEVELOPMENT"),
                Self::Staging => f.write_str("STAGING"),
                Self::Production => f.write_str("PRODUCTION"),
            }
        }
    }
    impl ::std::str::FromStr for Environment {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "DEVELOPMENT" => Ok(Self::Development),
                "STAGING" => Ok(Self::Staging),
                "PRODUCTION" => Ok(Self::Production),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for Environment {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for Environment {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for Environment {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`ErrorCode`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "INTEGRATION_NOT_FOUND",
    ///    "INTEGRATION_NOT_CONNECTED",
    ///    "INTEGRATION_NAME_ALREADY_EXISTS",
    ///    "INTEGRATION_ALREADY_CONNECTED",
    ///    "INVALID_PLATFORM",
    ///    "INVALID_PRESENCE_TYPE",
    ///    "PROXY_HOST_REQUIRED_WHEN_ENABLED",
    ///    "PROXY_PORT_REQUIRED_WHEN_ENABLED",
    ///    "INVALID_OWNER_ID",
    ///    "INVALID_IMAGE",
    ///    "REMOTE_INVALID_PARAMS",
    ///    "REMOTE_DELETED",
    ///    "REMOTE_ALREADY_PINNED",
    ///    "REMOTE_NOT_PINNED",
    ///    "REMOTE_ALREADY_ARCHIVED",
    ///    "REMOTE_NOT_ARCHIVED",
    ///    "REMOTE_ALREADY_DELETED",
    ///    "MESSAGE_DELETED",
    ///    "MESSAGE_ALREADY_DELETED",
    ///    "INVALID_NUMBER",
    ///    "MESSAGE_TOO_LONG",
    ///    "INVALID_MEDIA_URL",
    ///    "MEDIA_TOO_LARGE",
    ///    "UNSUPPORTED_MEDIA_TYPE",
    ///    "MESSAGE_NOT_FOUND",
    ///    "TOO_FEW_POLL_OPTIONS",
    ///    "TOO_MANY_POLL_OPTIONS",
    ///    "TOO_MANY_BUTTONS",
    ///    "CANNOT_EDIT_OTHERS_MESSAGE",
    ///    "EMPTY_CONTACT_LIST",
    ///    "EMPTY_SECTIONS",
    ///    "EMPTY_NUMBER_LIST",
    ///    "INVALID_AUDIO_URL",
    ///    "AUDIO_CONVERSION_FAILED",
    ///    "INVALID_STICKER_SOURCE",
    ///    "INVALID_COORDINATES",
    ///    "INVALID_STATUS_TYPE",
    ///    "INVALID_REMOTE_ID",
    ///    "MESSAGE_SEND_FAILED",
    ///    "INVALID_ID",
    ///    "BUSINESS_RULE_VIOLATION",
    ///    "INVALID_ENTITY",
    ///    "NOT_FOUND",
    ///    "ENTITY_CONFLICT",
    ///    "VALIDATION_FAILED",
    ///    "UNAUTHORIZED",
    ///    "FORBIDDEN",
    ///    "BAD_REQUEST",
    ///    "METHOD_NOT_ALLOWED",
    ///    "DATABASE_ERROR",
    ///    "EXTERNAL_SERVICE_ERROR",
    ///    "MISSING_ENVIRONMENT_VARIABLE",
    ///    "OPTIMISTIC_LOCK_CONFLICT"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "CodeChannelNotFound",
    ///    "CodeChannelNotConnected",
    ///    "CodeChannelNameAlreadyExists",
    ///    "CodeChannelAlreadyConnected",
    ///    "CodeInvalidPlatform",
    ///    "CodeInvalidPresenceType",
    ///    "CodeProxyHostRequired",
    ///    "CodeProxyPortRequired",
    ///    "CodeInvalidOwnerId",
    ///    "CodeInvalidImage",
    ///    "CodeRemoteInvalidParams",
    ///    "CodeRemoteDeleted",
    ///    "CodeRemoteAlreadyPinned",
    ///    "CodeRemoteNotPinned",
    ///    "CodeRemoteAlreadyArchived",
    ///    "CodeRemoteNotArchived",
    ///    "CodeRemoteAlreadyDeleted",
    ///    "CodeMessageDeleted",
    ///    "CodeMessageAlreadyDeleted",
    ///    "CodeInvalidNumber",
    ///    "CodeMessageTooLong",
    ///    "CodeInvalidMediaURL",
    ///    "CodeMediaTooLarge",
    ///    "CodeUnsupportedMediaType",
    ///    "CodeMessageNotFound",
    ///    "CodeTooFewPollOptions",
    ///    "CodeTooManyPollOptions",
    ///    "CodeTooManyButtons",
    ///    "CodeCannotEditOthers",
    ///    "CodeEmptyContactList",
    ///    "CodeEmptySections",
    ///    "CodeEmptyNumberList",
    ///    "CodeInvalidAudioURL",
    ///    "CodeAudioConversionFailed",
    ///    "CodeInvalidStickerSource",
    ///    "CodeInvalidCoordinates",
    ///    "CodeInvalidStatusType",
    ///    "CodeInvalidRemoteID",
    ///    "CodeMessageSendFailed",
    ///    "CodeInvalidID",
    ///    "CodeBusinessRule",
    ///    "CodeInvalidEntity",
    ///    "CodeNotFound",
    ///    "CodeEntityConflict",
    ///    "CodeValidationFailed",
    ///    "CodeUnauthorized",
    ///    "CodeForbidden",
    ///    "CodeBadRequest",
    ///    "CodeMethodNotAllowed",
    ///    "CodeDatabaseError",
    ///    "CodeExternalService",
    ///    "CodeMissingEnvVar",
    ///    "CodeOptimisticLockConflict"
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
    pub enum ErrorCode {
        #[serde(rename = "INTEGRATION_NOT_FOUND")]
        IntegrationNotFound,
        #[serde(rename = "INTEGRATION_NOT_CONNECTED")]
        IntegrationNotConnected,
        #[serde(rename = "INTEGRATION_NAME_ALREADY_EXISTS")]
        IntegrationNameAlreadyExists,
        #[serde(rename = "INTEGRATION_ALREADY_CONNECTED")]
        IntegrationAlreadyConnected,
        #[serde(rename = "INVALID_PLATFORM")]
        InvalidPlatform,
        #[serde(rename = "INVALID_PRESENCE_TYPE")]
        InvalidPresenceType,
        #[serde(rename = "PROXY_HOST_REQUIRED_WHEN_ENABLED")]
        ProxyHostRequiredWhenEnabled,
        #[serde(rename = "PROXY_PORT_REQUIRED_WHEN_ENABLED")]
        ProxyPortRequiredWhenEnabled,
        #[serde(rename = "INVALID_OWNER_ID")]
        InvalidOwnerId,
        #[serde(rename = "INVALID_IMAGE")]
        InvalidImage,
        #[serde(rename = "REMOTE_INVALID_PARAMS")]
        RemoteInvalidParams,
        #[serde(rename = "REMOTE_DELETED")]
        RemoteDeleted,
        #[serde(rename = "REMOTE_ALREADY_PINNED")]
        RemoteAlreadyPinned,
        #[serde(rename = "REMOTE_NOT_PINNED")]
        RemoteNotPinned,
        #[serde(rename = "REMOTE_ALREADY_ARCHIVED")]
        RemoteAlreadyArchived,
        #[serde(rename = "REMOTE_NOT_ARCHIVED")]
        RemoteNotArchived,
        #[serde(rename = "REMOTE_ALREADY_DELETED")]
        RemoteAlreadyDeleted,
        #[serde(rename = "MESSAGE_DELETED")]
        MessageDeleted,
        #[serde(rename = "MESSAGE_ALREADY_DELETED")]
        MessageAlreadyDeleted,
        #[serde(rename = "INVALID_NUMBER")]
        InvalidNumber,
        #[serde(rename = "MESSAGE_TOO_LONG")]
        MessageTooLong,
        #[serde(rename = "INVALID_MEDIA_URL")]
        InvalidMediaUrl,
        #[serde(rename = "MEDIA_TOO_LARGE")]
        MediaTooLarge,
        #[serde(rename = "UNSUPPORTED_MEDIA_TYPE")]
        UnsupportedMediaType,
        #[serde(rename = "MESSAGE_NOT_FOUND")]
        MessageNotFound,
        #[serde(rename = "TOO_FEW_POLL_OPTIONS")]
        TooFewPollOptions,
        #[serde(rename = "TOO_MANY_POLL_OPTIONS")]
        TooManyPollOptions,
        #[serde(rename = "TOO_MANY_BUTTONS")]
        TooManyButtons,
        #[serde(rename = "CANNOT_EDIT_OTHERS_MESSAGE")]
        CannotEditOthersMessage,
        #[serde(rename = "EMPTY_CONTACT_LIST")]
        EmptyContactList,
        #[serde(rename = "EMPTY_SECTIONS")]
        EmptySections,
        #[serde(rename = "EMPTY_NUMBER_LIST")]
        EmptyNumberList,
        #[serde(rename = "INVALID_AUDIO_URL")]
        InvalidAudioUrl,
        #[serde(rename = "AUDIO_CONVERSION_FAILED")]
        AudioConversionFailed,
        #[serde(rename = "INVALID_STICKER_SOURCE")]
        InvalidStickerSource,
        #[serde(rename = "INVALID_COORDINATES")]
        InvalidCoordinates,
        #[serde(rename = "INVALID_STATUS_TYPE")]
        InvalidStatusType,
        #[serde(rename = "INVALID_REMOTE_ID")]
        InvalidRemoteId,
        #[serde(rename = "MESSAGE_SEND_FAILED")]
        MessageSendFailed,
        #[serde(rename = "INVALID_ID")]
        InvalidId,
        #[serde(rename = "BUSINESS_RULE_VIOLATION")]
        BusinessRuleViolation,
        #[serde(rename = "INVALID_ENTITY")]
        InvalidEntity,
        #[serde(rename = "NOT_FOUND")]
        NotFound,
        #[serde(rename = "ENTITY_CONFLICT")]
        EntityConflict,
        #[serde(rename = "VALIDATION_FAILED")]
        ValidationFailed,
        #[serde(rename = "UNAUTHORIZED")]
        Unauthorized,
        #[serde(rename = "FORBIDDEN")]
        Forbidden,
        #[serde(rename = "BAD_REQUEST")]
        BadRequest,
        #[serde(rename = "METHOD_NOT_ALLOWED")]
        MethodNotAllowed,
        #[serde(rename = "DATABASE_ERROR")]
        DatabaseError,
        #[serde(rename = "EXTERNAL_SERVICE_ERROR")]
        ExternalServiceError,
        #[serde(rename = "MISSING_ENVIRONMENT_VARIABLE")]
        MissingEnvironmentVariable,
        #[serde(rename = "OPTIMISTIC_LOCK_CONFLICT")]
        OptimisticLockConflict,
    }
    impl ::std::convert::From<&Self> for ErrorCode {
        fn from(value: &ErrorCode) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ErrorCode {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::IntegrationNotFound => f.write_str("INTEGRATION_NOT_FOUND"),
                Self::IntegrationNotConnected => f.write_str("INTEGRATION_NOT_CONNECTED"),
                Self::IntegrationNameAlreadyExists => {
                    f.write_str("INTEGRATION_NAME_ALREADY_EXISTS")
                }
                Self::IntegrationAlreadyConnected => {
                    f.write_str("INTEGRATION_ALREADY_CONNECTED")
                }
                Self::InvalidPlatform => f.write_str("INVALID_PLATFORM"),
                Self::InvalidPresenceType => f.write_str("INVALID_PRESENCE_TYPE"),
                Self::ProxyHostRequiredWhenEnabled => {
                    f.write_str("PROXY_HOST_REQUIRED_WHEN_ENABLED")
                }
                Self::ProxyPortRequiredWhenEnabled => {
                    f.write_str("PROXY_PORT_REQUIRED_WHEN_ENABLED")
                }
                Self::InvalidOwnerId => f.write_str("INVALID_OWNER_ID"),
                Self::InvalidImage => f.write_str("INVALID_IMAGE"),
                Self::RemoteInvalidParams => f.write_str("REMOTE_INVALID_PARAMS"),
                Self::RemoteDeleted => f.write_str("REMOTE_DELETED"),
                Self::RemoteAlreadyPinned => f.write_str("REMOTE_ALREADY_PINNED"),
                Self::RemoteNotPinned => f.write_str("REMOTE_NOT_PINNED"),
                Self::RemoteAlreadyArchived => f.write_str("REMOTE_ALREADY_ARCHIVED"),
                Self::RemoteNotArchived => f.write_str("REMOTE_NOT_ARCHIVED"),
                Self::RemoteAlreadyDeleted => f.write_str("REMOTE_ALREADY_DELETED"),
                Self::MessageDeleted => f.write_str("MESSAGE_DELETED"),
                Self::MessageAlreadyDeleted => f.write_str("MESSAGE_ALREADY_DELETED"),
                Self::InvalidNumber => f.write_str("INVALID_NUMBER"),
                Self::MessageTooLong => f.write_str("MESSAGE_TOO_LONG"),
                Self::InvalidMediaUrl => f.write_str("INVALID_MEDIA_URL"),
                Self::MediaTooLarge => f.write_str("MEDIA_TOO_LARGE"),
                Self::UnsupportedMediaType => f.write_str("UNSUPPORTED_MEDIA_TYPE"),
                Self::MessageNotFound => f.write_str("MESSAGE_NOT_FOUND"),
                Self::TooFewPollOptions => f.write_str("TOO_FEW_POLL_OPTIONS"),
                Self::TooManyPollOptions => f.write_str("TOO_MANY_POLL_OPTIONS"),
                Self::TooManyButtons => f.write_str("TOO_MANY_BUTTONS"),
                Self::CannotEditOthersMessage => {
                    f.write_str("CANNOT_EDIT_OTHERS_MESSAGE")
                }
                Self::EmptyContactList => f.write_str("EMPTY_CONTACT_LIST"),
                Self::EmptySections => f.write_str("EMPTY_SECTIONS"),
                Self::EmptyNumberList => f.write_str("EMPTY_NUMBER_LIST"),
                Self::InvalidAudioUrl => f.write_str("INVALID_AUDIO_URL"),
                Self::AudioConversionFailed => f.write_str("AUDIO_CONVERSION_FAILED"),
                Self::InvalidStickerSource => f.write_str("INVALID_STICKER_SOURCE"),
                Self::InvalidCoordinates => f.write_str("INVALID_COORDINATES"),
                Self::InvalidStatusType => f.write_str("INVALID_STATUS_TYPE"),
                Self::InvalidRemoteId => f.write_str("INVALID_REMOTE_ID"),
                Self::MessageSendFailed => f.write_str("MESSAGE_SEND_FAILED"),
                Self::InvalidId => f.write_str("INVALID_ID"),
                Self::BusinessRuleViolation => f.write_str("BUSINESS_RULE_VIOLATION"),
                Self::InvalidEntity => f.write_str("INVALID_ENTITY"),
                Self::NotFound => f.write_str("NOT_FOUND"),
                Self::EntityConflict => f.write_str("ENTITY_CONFLICT"),
                Self::ValidationFailed => f.write_str("VALIDATION_FAILED"),
                Self::Unauthorized => f.write_str("UNAUTHORIZED"),
                Self::Forbidden => f.write_str("FORBIDDEN"),
                Self::BadRequest => f.write_str("BAD_REQUEST"),
                Self::MethodNotAllowed => f.write_str("METHOD_NOT_ALLOWED"),
                Self::DatabaseError => f.write_str("DATABASE_ERROR"),
                Self::ExternalServiceError => f.write_str("EXTERNAL_SERVICE_ERROR"),
                Self::MissingEnvironmentVariable => {
                    f.write_str("MISSING_ENVIRONMENT_VARIABLE")
                }
                Self::OptimisticLockConflict => f.write_str("OPTIMISTIC_LOCK_CONFLICT"),
            }
        }
    }
    impl ::std::str::FromStr for ErrorCode {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "INTEGRATION_NOT_FOUND" => Ok(Self::IntegrationNotFound),
                "INTEGRATION_NOT_CONNECTED" => Ok(Self::IntegrationNotConnected),
                "INTEGRATION_NAME_ALREADY_EXISTS" => {
                    Ok(Self::IntegrationNameAlreadyExists)
                }
                "INTEGRATION_ALREADY_CONNECTED" => Ok(Self::IntegrationAlreadyConnected),
                "INVALID_PLATFORM" => Ok(Self::InvalidPlatform),
                "INVALID_PRESENCE_TYPE" => Ok(Self::InvalidPresenceType),
                "PROXY_HOST_REQUIRED_WHEN_ENABLED" => {
                    Ok(Self::ProxyHostRequiredWhenEnabled)
                }
                "PROXY_PORT_REQUIRED_WHEN_ENABLED" => {
                    Ok(Self::ProxyPortRequiredWhenEnabled)
                }
                "INVALID_OWNER_ID" => Ok(Self::InvalidOwnerId),
                "INVALID_IMAGE" => Ok(Self::InvalidImage),
                "REMOTE_INVALID_PARAMS" => Ok(Self::RemoteInvalidParams),
                "REMOTE_DELETED" => Ok(Self::RemoteDeleted),
                "REMOTE_ALREADY_PINNED" => Ok(Self::RemoteAlreadyPinned),
                "REMOTE_NOT_PINNED" => Ok(Self::RemoteNotPinned),
                "REMOTE_ALREADY_ARCHIVED" => Ok(Self::RemoteAlreadyArchived),
                "REMOTE_NOT_ARCHIVED" => Ok(Self::RemoteNotArchived),
                "REMOTE_ALREADY_DELETED" => Ok(Self::RemoteAlreadyDeleted),
                "MESSAGE_DELETED" => Ok(Self::MessageDeleted),
                "MESSAGE_ALREADY_DELETED" => Ok(Self::MessageAlreadyDeleted),
                "INVALID_NUMBER" => Ok(Self::InvalidNumber),
                "MESSAGE_TOO_LONG" => Ok(Self::MessageTooLong),
                "INVALID_MEDIA_URL" => Ok(Self::InvalidMediaUrl),
                "MEDIA_TOO_LARGE" => Ok(Self::MediaTooLarge),
                "UNSUPPORTED_MEDIA_TYPE" => Ok(Self::UnsupportedMediaType),
                "MESSAGE_NOT_FOUND" => Ok(Self::MessageNotFound),
                "TOO_FEW_POLL_OPTIONS" => Ok(Self::TooFewPollOptions),
                "TOO_MANY_POLL_OPTIONS" => Ok(Self::TooManyPollOptions),
                "TOO_MANY_BUTTONS" => Ok(Self::TooManyButtons),
                "CANNOT_EDIT_OTHERS_MESSAGE" => Ok(Self::CannotEditOthersMessage),
                "EMPTY_CONTACT_LIST" => Ok(Self::EmptyContactList),
                "EMPTY_SECTIONS" => Ok(Self::EmptySections),
                "EMPTY_NUMBER_LIST" => Ok(Self::EmptyNumberList),
                "INVALID_AUDIO_URL" => Ok(Self::InvalidAudioUrl),
                "AUDIO_CONVERSION_FAILED" => Ok(Self::AudioConversionFailed),
                "INVALID_STICKER_SOURCE" => Ok(Self::InvalidStickerSource),
                "INVALID_COORDINATES" => Ok(Self::InvalidCoordinates),
                "INVALID_STATUS_TYPE" => Ok(Self::InvalidStatusType),
                "INVALID_REMOTE_ID" => Ok(Self::InvalidRemoteId),
                "MESSAGE_SEND_FAILED" => Ok(Self::MessageSendFailed),
                "INVALID_ID" => Ok(Self::InvalidId),
                "BUSINESS_RULE_VIOLATION" => Ok(Self::BusinessRuleViolation),
                "INVALID_ENTITY" => Ok(Self::InvalidEntity),
                "NOT_FOUND" => Ok(Self::NotFound),
                "ENTITY_CONFLICT" => Ok(Self::EntityConflict),
                "VALIDATION_FAILED" => Ok(Self::ValidationFailed),
                "UNAUTHORIZED" => Ok(Self::Unauthorized),
                "FORBIDDEN" => Ok(Self::Forbidden),
                "BAD_REQUEST" => Ok(Self::BadRequest),
                "METHOD_NOT_ALLOWED" => Ok(Self::MethodNotAllowed),
                "DATABASE_ERROR" => Ok(Self::DatabaseError),
                "EXTERNAL_SERVICE_ERROR" => Ok(Self::ExternalServiceError),
                "MISSING_ENVIRONMENT_VARIABLE" => Ok(Self::MissingEnvironmentVariable),
                "OPTIMISTIC_LOCK_CONFLICT" => Ok(Self::OptimisticLockConflict),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ErrorCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ErrorCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ErrorCode {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`ErrorResponse`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "code",
    ///    "message"
    ///  ],
    ///  "properties": {
    ///    "code": {
    ///      "type": "string"
    ///    },
    ///    "details": {
    ///      "x-unknown": true
    ///    },
    ///    "message": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ErrorResponse {
        pub code: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub details: ::std::option::Option<::serde_json::Value>,
        pub message: ::std::string::String,
    }
    impl ::std::convert::From<&ErrorResponse> for ErrorResponse {
        fn from(value: &ErrorResponse) -> Self {
            value.clone()
        }
    }
    ///`EventPayloads`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "InternalChannelMessageReceivedPlatformData": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/InternalChannelMessageReceivedPlatformData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "InternalChannelMessageSentPlatformData": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/InternalChannelMessageSentPlatformData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "InternalTextContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/InternalTextContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "WhatsAppChannelMessageReceivedPlatformData": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppChannelMessageReceivedPlatformData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "WhatsAppChannelMessageSentPlatformData": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppChannelMessageSentPlatformData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "channelConnected": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelConnectedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "channelDisconnected": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelDisconnectedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "channelEvent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelEvent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "channelLoggedOut": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelLoggedOutPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "chatPresenceUpdated": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelChatPresenceUpdatedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "membershipAdded": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMembershipAddedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "membershipRemoved": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMembershipRemovedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageDeleted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageDeletedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageDelivered": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageDeliveredPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageEdited": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageEditedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageReceived": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageReceivedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageSeen": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageSeenPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messageSent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessageSentPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "messagesSynced": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelMessagesSyncedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "presenceUpdated": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelPresenceUpdatedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteArchived": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteArchivedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteChatSeen": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteChatSeenPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteCreated": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteCreatedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteDeleted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteDeletedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteMarkedUnread": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteMarkedAsUnreadPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteMuted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteMutedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remotePinned": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemotePinnedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteUnarchived": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteUnarchivedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteUnmuted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteUnmutedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteUnpinned": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteUnpinnedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remoteUpdated": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemoteUpdatedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "remotesSynced": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelRemotesSyncedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "specialPlatformEvent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelSpecialPlatformEventReceivedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "syncCompleted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelSyncCompletedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "syncProgress": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelSyncProgressPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "syncStarted": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ChannelSyncStartedPayload"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppAudioContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppAudioContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppContactContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppContactContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppCredentials": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppCredentials"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppDocumentContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppDocumentContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppImageContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppImageContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppLocationContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppLocationContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppPollContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppPollContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppQRCodeUpdated": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppQRCodeUpdated"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppReactionContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppReactionContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppStickerContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppStickerContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppTextContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppTextContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "whatsAppVideoContent": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppVideoContent"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct EventPayloads {
        #[serde(
            rename = "channelConnected",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub channel_connected: ::std::option::Option<ChannelConnectedPayload>,
        #[serde(
            rename = "channelDisconnected",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub channel_disconnected: ::std::option::Option<ChannelDisconnectedPayload>,
        #[serde(
            rename = "channelEvent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub channel_event: ::std::option::Option<ChannelEvent>,
        #[serde(
            rename = "channelLoggedOut",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub channel_logged_out: ::std::option::Option<ChannelLoggedOutPayload>,
        #[serde(
            rename = "chatPresenceUpdated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub chat_presence_updated: ::std::option::Option<
            ChannelChatPresenceUpdatedPayload,
        >,
        #[serde(
            rename = "InternalChannelMessageReceivedPlatformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub internal_channel_message_received_platform_data: ::std::option::Option<
            InternalChannelMessageReceivedPlatformData,
        >,
        #[serde(
            rename = "InternalChannelMessageSentPlatformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub internal_channel_message_sent_platform_data: ::std::option::Option<
            InternalChannelMessageSentPlatformData,
        >,
        #[serde(
            rename = "InternalTextContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub internal_text_content: ::std::option::Option<InternalTextContent>,
        #[serde(
            rename = "membershipAdded",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub membership_added: ::std::option::Option<ChannelMembershipAddedPayload>,
        #[serde(
            rename = "membershipRemoved",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub membership_removed: ::std::option::Option<ChannelMembershipRemovedPayload>,
        #[serde(
            rename = "messageDeleted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_deleted: ::std::option::Option<ChannelMessageDeletedPayload>,
        #[serde(
            rename = "messageDelivered",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_delivered: ::std::option::Option<ChannelMessageDeliveredPayload>,
        #[serde(
            rename = "messageEdited",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_edited: ::std::option::Option<ChannelMessageEditedPayload>,
        #[serde(
            rename = "messageReceived",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_received: ::std::option::Option<ChannelMessageReceivedPayload>,
        #[serde(
            rename = "messageSeen",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_seen: ::std::option::Option<ChannelMessageSeenPayload>,
        #[serde(
            rename = "messageSent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_sent: ::std::option::Option<ChannelMessageSentPayload>,
        #[serde(
            rename = "messagesSynced",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub messages_synced: ::std::option::Option<ChannelMessagesSyncedPayload>,
        #[serde(
            rename = "presenceUpdated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub presence_updated: ::std::option::Option<ChannelPresenceUpdatedPayload>,
        #[serde(
            rename = "remoteArchived",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_archived: ::std::option::Option<ChannelRemoteArchivedPayload>,
        #[serde(
            rename = "remoteChatSeen",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_chat_seen: ::std::option::Option<ChannelRemoteChatSeenPayload>,
        #[serde(
            rename = "remoteCreated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_created: ::std::option::Option<ChannelRemoteCreatedPayload>,
        #[serde(
            rename = "remoteDeleted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_deleted: ::std::option::Option<ChannelRemoteDeletedPayload>,
        #[serde(
            rename = "remoteMarkedUnread",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_marked_unread: ::std::option::Option<
            ChannelRemoteMarkedAsUnreadPayload,
        >,
        #[serde(
            rename = "remoteMuted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_muted: ::std::option::Option<ChannelRemoteMutedPayload>,
        #[serde(
            rename = "remotePinned",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_pinned: ::std::option::Option<ChannelRemotePinnedPayload>,
        #[serde(
            rename = "remoteUnarchived",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_unarchived: ::std::option::Option<ChannelRemoteUnarchivedPayload>,
        #[serde(
            rename = "remoteUnmuted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_unmuted: ::std::option::Option<ChannelRemoteUnmutedPayload>,
        #[serde(
            rename = "remoteUnpinned",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_unpinned: ::std::option::Option<ChannelRemoteUnpinnedPayload>,
        #[serde(
            rename = "remoteUpdated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_updated: ::std::option::Option<ChannelRemoteUpdatedPayload>,
        #[serde(
            rename = "remotesSynced",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remotes_synced: ::std::option::Option<ChannelRemotesSyncedPayload>,
        #[serde(
            rename = "specialPlatformEvent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub special_platform_event: ::std::option::Option<
            ChannelSpecialPlatformEventReceivedPayload,
        >,
        #[serde(
            rename = "syncCompleted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub sync_completed: ::std::option::Option<ChannelSyncCompletedPayload>,
        #[serde(
            rename = "syncProgress",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub sync_progress: ::std::option::Option<ChannelSyncProgressPayload>,
        #[serde(
            rename = "syncStarted",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub sync_started: ::std::option::Option<ChannelSyncStartedPayload>,
        #[serde(
            rename = "whatsAppAudioContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_audio_content: ::std::option::Option<WhatsAppAudioContent>,
        #[serde(
            rename = "WhatsAppChannelMessageReceivedPlatformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_channel_message_received_platform_data: ::std::option::Option<
            WhatsAppChannelMessageReceivedPlatformData,
        >,
        #[serde(
            rename = "WhatsAppChannelMessageSentPlatformData",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_channel_message_sent_platform_data: ::std::option::Option<
            WhatsAppChannelMessageSentPlatformData,
        >,
        #[serde(
            rename = "whatsAppContactContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_contact_content: ::std::option::Option<WhatsAppContactContent>,
        #[serde(
            rename = "whatsAppCredentials",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_credentials: ::std::option::Option<WhatsAppCredentials>,
        #[serde(
            rename = "whatsAppDocumentContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_document_content: ::std::option::Option<WhatsAppDocumentContent>,
        #[serde(
            rename = "whatsAppImageContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_image_content: ::std::option::Option<WhatsAppImageContent>,
        #[serde(
            rename = "whatsAppLocationContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_location_content: ::std::option::Option<WhatsAppLocationContent>,
        #[serde(
            rename = "whatsAppPollContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_poll_content: ::std::option::Option<WhatsAppPollContent>,
        #[serde(
            rename = "whatsAppQRCodeUpdated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_qr_code_updated: ::std::option::Option<WhatsAppQrCodeUpdated>,
        #[serde(
            rename = "whatsAppReactionContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_reaction_content: ::std::option::Option<WhatsAppReactionContent>,
        #[serde(
            rename = "whatsAppStickerContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_sticker_content: ::std::option::Option<WhatsAppStickerContent>,
        #[serde(
            rename = "whatsAppTextContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_text_content: ::std::option::Option<WhatsAppTextContent>,
        #[serde(
            rename = "whatsAppVideoContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub whats_app_video_content: ::std::option::Option<WhatsAppVideoContent>,
    }
    impl ::std::convert::From<&EventPayloads> for EventPayloads {
        fn from(value: &EventPayloads) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for EventPayloads {
        fn default() -> Self {
            Self {
                channel_connected: Default::default(),
                channel_disconnected: Default::default(),
                channel_event: Default::default(),
                channel_logged_out: Default::default(),
                chat_presence_updated: Default::default(),
                internal_channel_message_received_platform_data: Default::default(),
                internal_channel_message_sent_platform_data: Default::default(),
                internal_text_content: Default::default(),
                membership_added: Default::default(),
                membership_removed: Default::default(),
                message_deleted: Default::default(),
                message_delivered: Default::default(),
                message_edited: Default::default(),
                message_received: Default::default(),
                message_seen: Default::default(),
                message_sent: Default::default(),
                messages_synced: Default::default(),
                presence_updated: Default::default(),
                remote_archived: Default::default(),
                remote_chat_seen: Default::default(),
                remote_created: Default::default(),
                remote_deleted: Default::default(),
                remote_marked_unread: Default::default(),
                remote_muted: Default::default(),
                remote_pinned: Default::default(),
                remote_unarchived: Default::default(),
                remote_unmuted: Default::default(),
                remote_unpinned: Default::default(),
                remote_updated: Default::default(),
                remotes_synced: Default::default(),
                special_platform_event: Default::default(),
                sync_completed: Default::default(),
                sync_progress: Default::default(),
                sync_started: Default::default(),
                whats_app_audio_content: Default::default(),
                whats_app_channel_message_received_platform_data: Default::default(),
                whats_app_channel_message_sent_platform_data: Default::default(),
                whats_app_contact_content: Default::default(),
                whats_app_credentials: Default::default(),
                whats_app_document_content: Default::default(),
                whats_app_image_content: Default::default(),
                whats_app_location_content: Default::default(),
                whats_app_poll_content: Default::default(),
                whats_app_qr_code_updated: Default::default(),
                whats_app_reaction_content: Default::default(),
                whats_app_sticker_content: Default::default(),
                whats_app_text_content: Default::default(),
                whats_app_video_content: Default::default(),
            }
        }
    }
    ///`ExtendedTextData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "matchedText": {
    ///      "type": "string"
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    },
    ///    "title": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ExtendedTextData {
        #[serde(
            rename = "matchedText",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub matched_text: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub text: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub title: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&ExtendedTextData> for ExtendedTextData {
        fn from(value: &ExtendedTextData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for ExtendedTextData {
        fn default() -> Self {
            Self {
                matched_text: Default::default(),
                text: Default::default(),
                title: Default::default(),
            }
        }
    }
    ///`ForwardMessageBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "remoteId",
    ///    "sourceRemoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511888888888@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "sourceRemoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ForwardMessageBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "sourceRemoteId")]
        pub source_remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&ForwardMessageBody> for ForwardMessageBody {
        fn from(value: &ForwardMessageBody) -> Self {
            value.clone()
        }
    }
    ///`ForwardMessageOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ForwardMessageOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&ForwardMessageOutput> for ForwardMessageOutput {
        fn from(value: &ForwardMessageOutput) -> Self {
            value.clone()
        }
    }
    ///`GetChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "createdAt",
    ///    "credentials",
    ///    "id",
    ///    "name",
    ///    "ownerRemoteId",
    ///    "platform",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "createdAt": {
    ///      "examples": [
    ///        "2026-02-19T10:30:00Z"
    ///      ],
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "credentials": {
    ///      "x-unknown": true
    ///    },
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "examples": [
    ///        "my-channel"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "ownerRemoteId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ChannelStatus"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct GetChannelOutput {
        #[serde(rename = "createdAt")]
        pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub credentials: ::serde_json::Value,
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerRemoteId")]
        pub owner_remote_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        pub status: ::codedm_contracts_rust::wire::enums::ChannelStatus,
    }
    impl ::std::convert::From<&GetChannelOutput> for GetChannelOutput {
        fn from(value: &GetChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`GetOrCreateChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "created",
    ///    "createdAt",
    ///    "id",
    ///    "name",
    ///    "ownerRemoteId",
    ///    "platform",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "created": {
    ///      "examples": [
    ///        "false"
    ///      ],
    ///      "type": "boolean"
    ///    },
    ///    "createdAt": {
    ///      "examples": [
    ///        "2026-02-19T10:30:00Z"
    ///      ],
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "examples": [
    ///        "whatsapp-default"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "ownerRemoteId": {
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ChannelStatus"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct GetOrCreateChannelOutput {
        pub created: bool,
        #[serde(rename = "createdAt")]
        pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerRemoteId")]
        pub owner_remote_id: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        pub status: ::codedm_contracts_rust::wire::enums::ChannelStatus,
    }
    impl ::std::convert::From<&GetOrCreateChannelOutput> for GetOrCreateChannelOutput {
        fn from(value: &GetOrCreateChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`ImageMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "caption": {
    ///      "type": "string"
    ///    },
    ///    "fileLength": {
    ///      "type": "integer"
    ///    },
    ///    "height": {
    ///      "type": "integer"
    ///    },
    ///    "jpegThumbnail": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "integer"
    ///      }
    ///    },
    ///    "mimetype": {
    ///      "type": "string"
    ///    },
    ///    "url": {
    ///      "type": "string"
    ///    },
    ///    "width": {
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ImageMessageData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "fileLength",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_length: ::std::option::Option<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub height: ::std::option::Option<i64>,
        #[serde(
            rename = "jpegThumbnail",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub jpeg_thumbnail: ::std::vec::Vec<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub mimetype: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub url: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub width: ::std::option::Option<i64>,
    }
    impl ::std::convert::From<&ImageMessageData> for ImageMessageData {
        fn from(value: &ImageMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for ImageMessageData {
        fn default() -> Self {
            Self {
                caption: Default::default(),
                file_length: Default::default(),
                height: Default::default(),
                jpeg_thumbnail: Default::default(),
                mimetype: Default::default(),
                url: Default::default(),
                width: Default::default(),
            }
        }
    }
    ///`IntegrationChannelChatPresenceUpdatedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelChatPresenceUpdatedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelChatPresenceUpdatedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelChatPresenceUpdatedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelChatPresenceUpdatedEvent>
    for IntegrationChannelChatPresenceUpdatedEvent {
        fn from(value: &IntegrationChannelChatPresenceUpdatedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelConnectedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelConnectedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelConnectedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelConnectedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelConnectedEvent>
    for IntegrationChannelConnectedEvent {
        fn from(value: &IntegrationChannelConnectedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelDisconnectedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelDisconnectedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelDisconnectedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelDisconnectedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelDisconnectedEvent>
    for IntegrationChannelDisconnectedEvent {
        fn from(value: &IntegrationChannelDisconnectedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelLoggedOutEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelLoggedOutPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelLoggedOutEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelLoggedOutPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelLoggedOutEvent>
    for IntegrationChannelLoggedOutEvent {
        fn from(value: &IntegrationChannelLoggedOutEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMembershipAddedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMembershipAddedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMembershipAddedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMembershipAddedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMembershipAddedEvent>
    for IntegrationChannelMembershipAddedEvent {
        fn from(value: &IntegrationChannelMembershipAddedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMembershipRemovedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMembershipRemovedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMembershipRemovedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMembershipRemovedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMembershipRemovedEvent>
    for IntegrationChannelMembershipRemovedEvent {
        fn from(value: &IntegrationChannelMembershipRemovedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMessageDeliveredEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageDeliveredPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMessageDeliveredEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMessageDeliveredPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMessageDeliveredEvent>
    for IntegrationChannelMessageDeliveredEvent {
        fn from(value: &IntegrationChannelMessageDeliveredEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMessageReceivedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageReceivedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMessageReceivedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMessageReceivedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMessageReceivedEvent>
    for IntegrationChannelMessageReceivedEvent {
        fn from(value: &IntegrationChannelMessageReceivedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMessageSeenEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessageSeenPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMessageSeenEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMessageSeenPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMessageSeenEvent>
    for IntegrationChannelMessageSeenEvent {
        fn from(value: &IntegrationChannelMessageSeenEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelMessagesSyncedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelMessagesSyncedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelMessagesSyncedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelMessagesSyncedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelMessagesSyncedEvent>
    for IntegrationChannelMessagesSyncedEvent {
        fn from(value: &IntegrationChannelMessagesSyncedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelPresenceUpdatedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelPresenceUpdatedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelPresenceUpdatedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelPresenceUpdatedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelPresenceUpdatedEvent>
    for IntegrationChannelPresenceUpdatedEvent {
        fn from(value: &IntegrationChannelPresenceUpdatedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelRemoteCreatedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteCreatedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelRemoteCreatedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelRemoteCreatedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelRemoteCreatedEvent>
    for IntegrationChannelRemoteCreatedEvent {
        fn from(value: &IntegrationChannelRemoteCreatedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelRemoteDeletedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteDeletedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelRemoteDeletedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelRemoteDeletedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelRemoteDeletedEvent>
    for IntegrationChannelRemoteDeletedEvent {
        fn from(value: &IntegrationChannelRemoteDeletedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelRemoteUpdatedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemoteUpdatedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelRemoteUpdatedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelRemoteUpdatedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelRemoteUpdatedEvent>
    for IntegrationChannelRemoteUpdatedEvent {
        fn from(value: &IntegrationChannelRemoteUpdatedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelRemotesSyncedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelRemotesSyncedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelRemotesSyncedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelRemotesSyncedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelRemotesSyncedEvent>
    for IntegrationChannelRemotesSyncedEvent {
        fn from(value: &IntegrationChannelRemotesSyncedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelSpecialPlatformEventReceivedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelSpecialPlatformEventReceivedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelSpecialPlatformEventReceivedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelSpecialPlatformEventReceivedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelSpecialPlatformEventReceivedEvent>
    for IntegrationChannelSpecialPlatformEventReceivedEvent {
        fn from(value: &IntegrationChannelSpecialPlatformEventReceivedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelSyncCompletedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelSyncCompletedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelSyncCompletedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelSyncCompletedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelSyncCompletedEvent>
    for IntegrationChannelSyncCompletedEvent {
        fn from(value: &IntegrationChannelSyncCompletedEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelSyncProgressEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelSyncProgressPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelSyncProgressEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelSyncProgressPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelSyncProgressEvent>
    for IntegrationChannelSyncProgressEvent {
        fn from(value: &IntegrationChannelSyncProgressEvent) -> Self {
            value.clone()
        }
    }
    ///`IntegrationChannelSyncStartedEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "name",
    ///    "ownerId",
    ///    "payload",
    ///    "time"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    },
    ///    "ownerId": {
    ///      "type": "string"
    ///    },
    ///    "payload": {
    ///      "$ref": "#/components/schemas/ChannelSyncStartedPayload"
    ///    },
    ///    "time": {
    ///      "type": "string",
    ///      "format": "date-time"
    ///    }
    ///  },
    ///  "x-tag": "event"
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct IntegrationChannelSyncStartedEvent {
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        #[serde(rename = "ownerId")]
        pub owner_id: ::std::string::String,
        pub payload: ChannelSyncStartedPayload,
        pub time: ::chrono::DateTime<::chrono::offset::Utc>,
    }
    impl ::std::convert::From<&IntegrationChannelSyncStartedEvent>
    for IntegrationChannelSyncStartedEvent {
        fn from(value: &IntegrationChannelSyncStartedEvent) -> Self {
            value.clone()
        }
    }
    ///`InternalChannelMessageReceivedPlatformData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "metadata"
    ///  ],
    ///  "properties": {
    ///    "metadata": {
    ///      "type": "object",
    ///      "additionalProperties": {
    ///        "x-unknown": true
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct InternalChannelMessageReceivedPlatformData {
        pub metadata: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    }
    impl ::std::convert::From<&InternalChannelMessageReceivedPlatformData>
    for InternalChannelMessageReceivedPlatformData {
        fn from(value: &InternalChannelMessageReceivedPlatformData) -> Self {
            value.clone()
        }
    }
    ///`InternalChannelMessageSentPlatformData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "metadata"
    ///  ],
    ///  "properties": {
    ///    "metadata": {
    ///      "type": "object",
    ///      "additionalProperties": {
    ///        "x-unknown": true
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct InternalChannelMessageSentPlatformData {
        pub metadata: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    }
    impl ::std::convert::From<&InternalChannelMessageSentPlatformData>
    for InternalChannelMessageSentPlatformData {
        fn from(value: &InternalChannelMessageSentPlatformData) -> Self {
            value.clone()
        }
    }
    ///`InternalTextContent`
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
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct InternalTextContent {
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&InternalTextContent> for InternalTextContent {
        fn from(value: &InternalTextContent) -> Self {
            value.clone()
        }
    }
    ///`ListChannelsItem`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "createdAt",
    ///    "credentials",
    ///    "id",
    ///    "name",
    ///    "platform",
    ///    "status"
    ///  ],
    ///  "properties": {
    ///    "createdAt": {
    ///      "examples": [
    ///        "2026-02-19T10:30:00Z"
    ///      ],
    ///      "type": "string",
    ///      "format": "date-time"
    ///    },
    ///    "credentials": {
    ///      "x-unknown": true
    ///    },
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "name": {
    ///      "examples": [
    ///        "my-channel"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "platform": {
    ///      "$ref": "#/components/schemas/ChannelKind"
    ///    },
    ///    "status": {
    ///      "$ref": "#/components/schemas/ChannelStatus"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ListChannelsItem {
        #[serde(rename = "createdAt")]
        pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
        pub credentials: ::serde_json::Value,
        pub id: ::std::string::String,
        pub name: ::std::string::String,
        pub platform: ::codedm_contracts_rust::wire::enums::ChannelKind,
        pub status: ::codedm_contracts_rust::wire::enums::ChannelStatus,
    }
    impl ::std::convert::From<&ListChannelsItem> for ListChannelsItem {
        fn from(value: &ListChannelsItem) -> Self {
            value.clone()
        }
    }
    ///`ListChannelsOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "items",
    ///    "total"
    ///  ],
    ///  "properties": {
    ///    "items": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ListChannelsItem"
    ///      }
    ///    },
    ///    "total": {
    ///      "examples": [
    ///        "42"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ListChannelsOutput {
        pub items: ::std::vec::Vec<ListChannelsItem>,
        pub total: i64,
    }
    impl ::std::convert::From<&ListChannelsOutput> for ListChannelsOutput {
        fn from(value: &ListChannelsOutput) -> Self {
            value.clone()
        }
    }
    ///`ListRow`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "rowId",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "description": {
    ///      "examples": [
    ///        "Description of row 1"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "rowId": {
    ///      "examples": [
    ///        "row-1"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "title": {
    ///      "examples": [
    ///        "Row 1"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ListRow {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub description: ::std::option::Option<::std::string::String>,
        #[serde(rename = "rowId")]
        pub row_id: ::std::string::String,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&ListRow> for ListRow {
        fn from(value: &ListRow) -> Self {
            value.clone()
        }
    }
    ///`ListSection`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "rows",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "rows": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ListRow"
    ///      }
    ///    },
    ///    "title": {
    ///      "examples": [
    ///        "Section 1"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ListSection {
        pub rows: ::std::vec::Vec<ListRow>,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&ListSection> for ListSection {
        fn from(value: &ListSection) -> Self {
            value.clone()
        }
    }
    ///`LocationMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "address": {
    ///      "type": "string"
    ///    },
    ///    "degreesLatitude": {
    ///      "type": "number"
    ///    },
    ///    "degreesLongitude": {
    ///      "type": "number"
    ///    },
    ///    "jpegThumbnail": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "integer"
    ///      }
    ///    },
    ///    "name": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct LocationMessageData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub address: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "degreesLatitude",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub degrees_latitude: ::std::option::Option<f64>,
        #[serde(
            rename = "degreesLongitude",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub degrees_longitude: ::std::option::Option<f64>,
        #[serde(
            rename = "jpegThumbnail",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub jpeg_thumbnail: ::std::vec::Vec<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub name: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&LocationMessageData> for LocationMessageData {
        fn from(value: &LocationMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for LocationMessageData {
        fn default() -> Self {
            Self {
                address: Default::default(),
                degrees_latitude: Default::default(),
                degrees_longitude: Default::default(),
                jpeg_thumbnail: Default::default(),
                name: Default::default(),
            }
        }
    }
    ///`LogLevel`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "DEBUG",
    ///    "INFO",
    ///    "WARN",
    ///    "ERROR"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "LogLevelDebug",
    ///    "LogLevelInfo",
    ///    "LogLevelWarn",
    ///    "LogLevelError"
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
    pub enum LogLevel {
        #[serde(rename = "DEBUG")]
        Debug,
        #[serde(rename = "INFO")]
        Info,
        #[serde(rename = "WARN")]
        Warn,
        #[serde(rename = "ERROR")]
        Error,
    }
    impl ::std::convert::From<&Self> for LogLevel {
        fn from(value: &LogLevel) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for LogLevel {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Debug => f.write_str("DEBUG"),
                Self::Info => f.write_str("INFO"),
                Self::Warn => f.write_str("WARN"),
                Self::Error => f.write_str("ERROR"),
            }
        }
    }
    impl ::std::str::FromStr for LogLevel {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "DEBUG" => Ok(Self::Debug),
                "INFO" => Ok(Self::Info),
                "WARN" => Ok(Self::Warn),
                "ERROR" => Ok(Self::Error),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for LogLevel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for LogLevel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for LogLevel {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`LogoutChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "state"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "state": {
    ///      "examples": [
    ///        "CLOSE"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct LogoutChannelOutput {
        pub id: ::std::string::String,
        pub state: ::std::string::String,
    }
    impl ::std::convert::From<&LogoutChannelOutput> for LogoutChannelOutput {
        fn from(value: &LogoutChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`MarkRemoteAsSeenBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct MarkRemoteAsSeenBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&MarkRemoteAsSeenBody> for MarkRemoteAsSeenBody {
        fn from(value: &MarkRemoteAsSeenBody) -> Self {
            value.clone()
        }
    }
    ///`MarkRemoteAsUnreadBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct MarkRemoteAsUnreadBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&MarkRemoteAsUnreadBody> for MarkRemoteAsUnreadBody {
        fn from(value: &MarkRemoteAsUnreadBody) -> Self {
            value.clone()
        }
    }
    ///`MuteRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "muteExpiration": {
    ///      "examples": [
    ///        "-1"
    ///      ],
    ///      "type": "integer"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct MuteRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(
            rename = "muteExpiration",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub mute_expiration: ::std::option::Option<i64>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&MuteRemoteBody> for MuteRemoteBody {
        fn from(value: &MuteRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`PinRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct PinRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&PinRemoteBody> for PinRemoteBody {
        fn from(value: &PinRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`PollMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "options",
    ///    "question"
    ///  ],
    ///  "properties": {
    ///    "options": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "string"
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
    pub struct PollMessageData {
        pub options: ::std::vec::Vec<::std::string::String>,
        pub question: ::std::string::String,
    }
    impl ::std::convert::From<&PollMessageData> for PollMessageData {
        fn from(value: &PollMessageData) -> Self {
            value.clone()
        }
    }
    ///`PollOption`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "optionName"
    ///  ],
    ///  "properties": {
    ///    "optionName": {
    ///      "examples": [
    ///        "Option A"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct PollOption {
        #[serde(rename = "optionName")]
        pub option_name: ::std::string::String,
    }
    impl ::std::convert::From<&PollOption> for PollOption {
        fn from(value: &PollOption) -> Self {
            value.clone()
        }
    }
    ///`ProxyProtocol`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "HTTP",
    ///    "HTTPS",
    ///    "SOCKS4",
    ///    "SOCKS5"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "ProxyProtocolHTTP",
    ///    "ProxyProtocolHTTPS",
    ///    "ProxyProtocolSOCKS4",
    ///    "ProxyProtocolSOCKS5"
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
    pub enum ProxyProtocol {
        #[serde(rename = "HTTP")]
        Http,
        #[serde(rename = "HTTPS")]
        Https,
        #[serde(rename = "SOCKS4")]
        Socks4,
        #[serde(rename = "SOCKS5")]
        Socks5,
    }
    impl ::std::convert::From<&Self> for ProxyProtocol {
        fn from(value: &ProxyProtocol) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ProxyProtocol {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Http => f.write_str("HTTP"),
                Self::Https => f.write_str("HTTPS"),
                Self::Socks4 => f.write_str("SOCKS4"),
                Self::Socks5 => f.write_str("SOCKS5"),
            }
        }
    }
    impl ::std::str::FromStr for ProxyProtocol {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "HTTP" => Ok(Self::Http),
                "HTTPS" => Ok(Self::Https),
                "SOCKS4" => Ok(Self::Socks4),
                "SOCKS5" => Ok(Self::Socks5),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ProxyProtocol {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ProxyProtocol {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ProxyProtocol {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`ReactionKeyData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "fromMe": {
    ///      "type": "boolean"
    ///    },
    ///    "id": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ReactionKeyData {
        #[serde(
            rename = "fromMe",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub from_me: ::std::option::Option<bool>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub id: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "remoteId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_id: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&ReactionKeyData> for ReactionKeyData {
        fn from(value: &ReactionKeyData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for ReactionKeyData {
        fn default() -> Self {
            Self {
                from_me: Default::default(),
                id: Default::default(),
                remote_id: Default::default(),
            }
        }
    }
    ///`ReactionMessageData`
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
    ///    "key": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ReactionKeyData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct ReactionMessageData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub key: ::std::option::Option<ReactionKeyData>,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&ReactionMessageData> for ReactionMessageData {
        fn from(value: &ReactionMessageData) -> Self {
            value.clone()
        }
    }
    ///`ReceiptType`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "delivered",
    ///    "read",
    ///    "read-self",
    ///    "played"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "ReceiptTypeDelivered",
    ///    "ReceiptTypeRead",
    ///    "ReceiptTypeReadSelf",
    ///    "ReceiptTypePlayed"
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
    pub enum ReceiptType {
        #[serde(rename = "delivered")]
        Delivered,
        #[serde(rename = "read")]
        Read,
        #[serde(rename = "read-self")]
        ReadSelf,
        #[serde(rename = "played")]
        Played,
    }
    impl ::std::convert::From<&Self> for ReceiptType {
        fn from(value: &ReceiptType) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ReceiptType {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::Delivered => f.write_str("delivered"),
                Self::Read => f.write_str("read"),
                Self::ReadSelf => f.write_str("read-self"),
                Self::Played => f.write_str("played"),
            }
        }
    }
    impl ::std::str::FromStr for ReceiptType {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "delivered" => Ok(Self::Delivered),
                "read" => Ok(Self::Read),
                "read-self" => Ok(Self::ReadSelf),
                "played" => Ok(Self::Played),
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ReceiptType {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ReceiptType {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ReceiptType {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`RestartChannelOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "id",
    ///    "state"
    ///  ],
    ///  "properties": {
    ///    "id": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "state": {
    ///      "examples": [
    ///        "CONNECTING"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct RestartChannelOutput {
        pub id: ::std::string::String,
        pub state: ::std::string::String,
    }
    impl ::std::convert::From<&RestartChannelOutput> for RestartChannelOutput {
        fn from(value: &RestartChannelOutput) -> Self {
            value.clone()
        }
    }
    ///`SendAudioBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "audioUrl",
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "audioUrl": {
    ///      "examples": [
    ///        "https://example.com/audio.ogg"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendAudioBody {
        #[serde(rename = "audioUrl")]
        pub audio_url: ::std::string::String,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendAudioBody> for SendAudioBody {
        fn from(value: &SendAudioBody) -> Self {
            value.clone()
        }
    }
    ///`SendAudioOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendAudioOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendAudioOutput> for SendAudioOutput {
        fn from(value: &SendAudioOutput) -> Self {
            value.clone()
        }
    }
    ///`SendButtonBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "buttons",
    ///    "channelId",
    ///    "description",
    ///    "remoteId",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "buttons": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ButtonItem"
    ///      }
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "description": {
    ///      "examples": [
    ///        "Would you like to proceed?"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "footer": {
    ///      "examples": [
    ///        "Reply within 24h"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "title": {
    ///      "examples": [
    ///        "Confirm your order"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendButtonBody {
        pub buttons: ::std::vec::Vec<ButtonItem>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub description: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub footer: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&SendButtonBody> for SendButtonBody {
        fn from(value: &SendButtonBody) -> Self {
            value.clone()
        }
    }
    ///`SendButtonOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendButtonOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendButtonOutput> for SendButtonOutput {
        fn from(value: &SendButtonOutput) -> Self {
            value.clone()
        }
    }
    ///`SendChatPresenceBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "presence",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "presence": {
    ///      "$ref": "#/components/schemas/ChatPresenceType"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendChatPresenceBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub presence: ::codedm_contracts_rust::wire::enums::ChatPresenceType,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendChatPresenceBody> for SendChatPresenceBody {
        fn from(value: &SendChatPresenceBody) -> Self {
            value.clone()
        }
    }
    ///`SendChatPresenceOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "success"
    ///  ],
    ///  "properties": {
    ///    "success": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendChatPresenceOutput {
        pub success: bool,
    }
    impl ::std::convert::From<&SendChatPresenceOutput> for SendChatPresenceOutput {
        fn from(value: &SendChatPresenceOutput) -> Self {
            value.clone()
        }
    }
    ///`SendContactBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "contacts",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "contacts": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ContactInfo"
    ///      }
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendContactBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub contacts: ::std::vec::Vec<ContactInfo>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendContactBody> for SendContactBody {
        fn from(value: &SendContactBody) -> Self {
            value.clone()
        }
    }
    ///`SendContactOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendContactOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendContactOutput> for SendContactOutput {
        fn from(value: &SendContactOutput) -> Self {
            value.clone()
        }
    }
    ///`SendFileBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "mediaUrl",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "fileName": {
    ///      "examples": [
    ///        "document.pdf"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mediaUrl": {
    ///      "examples": [
    ///        "https://example.com/document.pdf"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mimeType": {
    ///      "examples": [
    ///        "application/pdf"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendFileBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(
            rename = "fileName",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_name: ::std::option::Option<::std::string::String>,
        #[serde(rename = "mediaUrl")]
        pub media_url: ::std::string::String,
        #[serde(
            rename = "mimeType",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub mime_type: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendFileBody> for SendFileBody {
        fn from(value: &SendFileBody) -> Self {
            value.clone()
        }
    }
    ///`SendFileOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendFileOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendFileOutput> for SendFileOutput {
        fn from(value: &SendFileOutput) -> Self {
            value.clone()
        }
    }
    ///`SendImageBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "mediaUrl",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "caption": {
    ///      "examples": [
    ///        "Check this out"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mediaUrl": {
    ///      "examples": [
    ///        "https://example.com/image.png"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mentioned": {
    ///      "examples": [
    ///        "5511999999999"
    ///      ],
    ///      "type": "array",
    ///      "items": {
    ///        "type": "string"
    ///      }
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendImageBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "mediaUrl")]
        pub media_url: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub mentioned: ::std::vec::Vec<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendImageBody> for SendImageBody {
        fn from(value: &SendImageBody) -> Self {
            value.clone()
        }
    }
    ///`SendImageOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendImageOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendImageOutput> for SendImageOutput {
        fn from(value: &SendImageOutput) -> Self {
            value.clone()
        }
    }
    ///`SendLinkBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId",
    ///    "url"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "description": {
    ///      "examples": [
    ///        "Check out this article about technology"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "thumbnailUrl": {
    ///      "examples": [
    ///        "https://example.com/thumb.jpg"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "title": {
    ///      "examples": [
    ///        "Interesting Article"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "url": {
    ///      "examples": [
    ///        "https://example.com/article"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendLinkBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub description: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(
            rename = "thumbnailUrl",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub thumbnail_url: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub title: ::std::option::Option<::std::string::String>,
        pub url: ::std::string::String,
    }
    impl ::std::convert::From<&SendLinkBody> for SendLinkBody {
        fn from(value: &SendLinkBody) -> Self {
            value.clone()
        }
    }
    ///`SendLinkOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendLinkOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendLinkOutput> for SendLinkOutput {
        fn from(value: &SendLinkOutput) -> Self {
            value.clone()
        }
    }
    ///`SendListBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "buttonText",
    ///    "channelId",
    ///    "description",
    ///    "remoteId",
    ///    "sections",
    ///    "title"
    ///  ],
    ///  "properties": {
    ///    "buttonText": {
    ///      "examples": [
    ///        "View Options"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "description": {
    ///      "examples": [
    ///        "Choose from the options below"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "footerText": {
    ///      "examples": [
    ///        "Powered by our bot"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "sections": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ListSection"
    ///      }
    ///    },
    ///    "title": {
    ///      "examples": [
    ///        "Our Menu"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendListBody {
        #[serde(rename = "buttonText")]
        pub button_text: ::std::string::String,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub description: ::std::string::String,
        #[serde(
            rename = "footerText",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub footer_text: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        pub sections: ::std::vec::Vec<ListSection>,
        pub title: ::std::string::String,
    }
    impl ::std::convert::From<&SendListBody> for SendListBody {
        fn from(value: &SendListBody) -> Self {
            value.clone()
        }
    }
    ///`SendListOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendListOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendListOutput> for SendListOutput {
        fn from(value: &SendListOutput) -> Self {
            value.clone()
        }
    }
    ///`SendLocationBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "address": {
    ///      "examples": [
    ///        "Av. Paulista, 1578 - Bela Vista, Sao Paulo"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "latitude": {
    ///      "examples": [
    ///        "-23.5505"
    ///      ],
    ///      "type": "number"
    ///    },
    ///    "longitude": {
    ///      "examples": [
    ///        "-46.6333"
    ///      ],
    ///      "type": "number"
    ///    },
    ///    "name": {
    ///      "examples": [
    ///        "Paulista Avenue"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendLocationBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub address: ::std::option::Option<::std::string::String>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub latitude: ::std::option::Option<f64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub longitude: ::std::option::Option<f64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub name: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendLocationBody> for SendLocationBody {
        fn from(value: &SendLocationBody) -> Self {
            value.clone()
        }
    }
    ///`SendLocationOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendLocationOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendLocationOutput> for SendLocationOutput {
        fn from(value: &SendLocationOutput) -> Self {
            value.clone()
        }
    }
    ///`SendMediaBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "mediaType",
    ///    "mediaUrl",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "caption": {
    ///      "examples": [
    ///        "Check this out"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "fileName": {
    ///      "examples": [
    ///        "document.pdf"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mediaType": {
    ///      "$ref": "#/components/schemas/MessageType"
    ///    },
    ///    "mediaUrl": {
    ///      "examples": [
    ///        "https://example.com/image.png"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendMediaBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(
            rename = "fileName",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_name: ::std::option::Option<::std::string::String>,
        #[serde(rename = "mediaType")]
        pub media_type: ::codedm_contracts_rust::wire::enums::MessageType,
        #[serde(rename = "mediaUrl")]
        pub media_url: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendMediaBody> for SendMediaBody {
        fn from(value: &SendMediaBody) -> Self {
            value.clone()
        }
    }
    ///`SendMediaOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendMediaOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendMediaOutput> for SendMediaOutput {
        fn from(value: &SendMediaOutput) -> Self {
            value.clone()
        }
    }
    ///`SendPollBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "options",
    ///    "pollName",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "options": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/PollOption"
    ///      }
    ///    },
    ///    "pollName": {
    ///      "examples": [
    ///        "What do you prefer?"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "selectableCount": {
    ///      "examples": [
    ///        "1"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendPollBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub options: ::std::vec::Vec<PollOption>,
        #[serde(rename = "pollName")]
        pub poll_name: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(
            rename = "selectableCount",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub selectable_count: ::std::option::Option<i64>,
    }
    impl ::std::convert::From<&SendPollBody> for SendPollBody {
        fn from(value: &SendPollBody) -> Self {
            value.clone()
        }
    }
    ///`SendPollOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendPollOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendPollOutput> for SendPollOutput {
        fn from(value: &SendPollOutput) -> Self {
            value.clone()
        }
    }
    ///`SendReactionBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "messageId",
    ///    "reaction",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "fromMe": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "reaction": {
    ///      "examples": [
    ///        "👍"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendReactionBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(
            rename = "fromMe",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub from_me: ::std::option::Option<bool>,
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub reaction: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendReactionBody> for SendReactionBody {
        fn from(value: &SendReactionBody) -> Self {
            value.clone()
        }
    }
    ///`SendReactionOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "success"
    ///  ],
    ///  "properties": {
    ///    "success": {
    ///      "examples": [
    ///        "true"
    ///      ],
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendReactionOutput {
        pub success: bool,
    }
    impl ::std::convert::From<&SendReactionOutput> for SendReactionOutput {
        fn from(value: &SendReactionOutput) -> Self {
            value.clone()
        }
    }
    ///`SendStatusBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "content",
    ///    "statusType"
    ///  ],
    ///  "properties": {
    ///    "backgroundColor": {
    ///      "examples": [
    ///        "#FF5733"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "caption": {
    ///      "examples": [
    ///        "My caption"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "content": {
    ///      "examples": [
    ///        "Hello, this is my status!"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "font": {
    ///      "examples": [
    ///        "SERIF"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "statusType": {
    ///      "$ref": "#/components/schemas/MessageType"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendStatusBody {
        #[serde(
            rename = "backgroundColor",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub background_color: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        pub content: ::std::string::String,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub font: ::std::option::Option<::std::string::String>,
        #[serde(rename = "statusType")]
        pub status_type: ::codedm_contracts_rust::wire::enums::MessageType,
    }
    impl ::std::convert::From<&SendStatusBody> for SendStatusBody {
        fn from(value: &SendStatusBody) -> Self {
            value.clone()
        }
    }
    ///`SendStatusOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendStatusOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendStatusOutput> for SendStatusOutput {
        fn from(value: &SendStatusOutput) -> Self {
            value.clone()
        }
    }
    ///`SendStickerBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId",
    ///    "stickerUrl"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "stickerUrl": {
    ///      "examples": [
    ///        "https://example.com/sticker.webp"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendStickerBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        #[serde(rename = "stickerUrl")]
        pub sticker_url: ::std::string::String,
    }
    impl ::std::convert::From<&SendStickerBody> for SendStickerBody {
        fn from(value: &SendStickerBody) -> Self {
            value.clone()
        }
    }
    ///`SendStickerOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendStickerOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendStickerOutput> for SendStickerOutput {
        fn from(value: &SendStickerOutput) -> Self {
            value.clone()
        }
    }
    ///`SendTextBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId",
    ///    "text"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "quotedMessageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "text": {
    ///      "examples": [
    ///        "Hello, world!"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendTextBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(
            rename = "quotedMessageId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub quoted_message_id: ::std::option::Option<::std::string::String>,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&SendTextBody> for SendTextBody {
        fn from(value: &SendTextBody) -> Self {
            value.clone()
        }
    }
    ///`SendTextOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendTextOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendTextOutput> for SendTextOutput {
        fn from(value: &SendTextOutput) -> Self {
            value.clone()
        }
    }
    ///`SendVideoBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "mediaUrl",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "caption": {
    ///      "examples": [
    ///        "Watch this video"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "mediaUrl": {
    ///      "examples": [
    ///        "https://example.com/video.mp4"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendVideoBody {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "mediaUrl")]
        pub media_url: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&SendVideoBody> for SendVideoBody {
        fn from(value: &SendVideoBody) -> Self {
            value.clone()
        }
    }
    ///`SendVideoOutput`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "messageId",
    ///    "timestamp"
    ///  ],
    ///  "properties": {
    ///    "messageId": {
    ///      "examples": [
    ///        "3EB0B430A6B7FBEC1200"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "timestamp": {
    ///      "examples": [
    ///        "1710000000"
    ///      ],
    ///      "type": "integer"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SendVideoOutput {
        #[serde(rename = "messageId")]
        pub message_id: ::std::string::String,
        pub timestamp: i64,
    }
    impl ::std::convert::From<&SendVideoOutput> for SendVideoOutput {
        fn from(value: &SendVideoOutput) -> Self {
            value.clone()
        }
    }
    ///`ServerEvent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "oneOf": [
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelChatPresenceUpdatedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelConnectedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelDisconnectedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelLoggedOutEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMembershipAddedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMembershipRemovedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMessagesSyncedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelPresenceUpdatedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelRemoteCreatedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelRemoteDeletedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelRemoteUpdatedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelRemotesSyncedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelSyncCompletedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelSyncProgressEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelSyncStartedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMessageDeliveredEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMessageReceivedEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelMessageSeenEvent"
    ///    },
    ///    {
    ///      "$ref": "#/components/schemas/IntegrationChannelSpecialPlatformEventReceivedEvent"
    ///    }
    ///  ],
    ///  "x-discriminators": [
    ///    "name"
    ///  ]
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum ServerEvent {
        ChatPresenceUpdatedEvent(IntegrationChannelChatPresenceUpdatedEvent),
        ConnectedEvent(IntegrationChannelConnectedEvent),
        DisconnectedEvent(IntegrationChannelDisconnectedEvent),
        LoggedOutEvent(IntegrationChannelLoggedOutEvent),
        MembershipAddedEvent(IntegrationChannelMembershipAddedEvent),
        MembershipRemovedEvent(IntegrationChannelMembershipRemovedEvent),
        MessagesSyncedEvent(IntegrationChannelMessagesSyncedEvent),
        PresenceUpdatedEvent(IntegrationChannelPresenceUpdatedEvent),
        RemoteCreatedEvent(IntegrationChannelRemoteCreatedEvent),
        RemoteDeletedEvent(IntegrationChannelRemoteDeletedEvent),
        RemoteUpdatedEvent(IntegrationChannelRemoteUpdatedEvent),
        RemotesSyncedEvent(IntegrationChannelRemotesSyncedEvent),
        SyncCompletedEvent(IntegrationChannelSyncCompletedEvent),
        SyncProgressEvent(IntegrationChannelSyncProgressEvent),
        SyncStartedEvent(IntegrationChannelSyncStartedEvent),
        MessageDeliveredEvent(IntegrationChannelMessageDeliveredEvent),
        MessageReceivedEvent(IntegrationChannelMessageReceivedEvent),
        MessageSeenEvent(IntegrationChannelMessageSeenEvent),
        SpecialPlatformEventReceivedEvent(
            IntegrationChannelSpecialPlatformEventReceivedEvent,
        ),
    }
    impl ::std::convert::From<&Self> for ServerEvent {
        fn from(value: &ServerEvent) -> Self {
            value.clone()
        }
    }
    impl ::std::convert::From<IntegrationChannelChatPresenceUpdatedEvent>
    for ServerEvent {
        fn from(value: IntegrationChannelChatPresenceUpdatedEvent) -> Self {
            Self::ChatPresenceUpdatedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelConnectedEvent> for ServerEvent {
        fn from(value: IntegrationChannelConnectedEvent) -> Self {
            Self::ConnectedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelDisconnectedEvent> for ServerEvent {
        fn from(value: IntegrationChannelDisconnectedEvent) -> Self {
            Self::DisconnectedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelLoggedOutEvent> for ServerEvent {
        fn from(value: IntegrationChannelLoggedOutEvent) -> Self {
            Self::LoggedOutEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMembershipAddedEvent> for ServerEvent {
        fn from(value: IntegrationChannelMembershipAddedEvent) -> Self {
            Self::MembershipAddedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMembershipRemovedEvent> for ServerEvent {
        fn from(value: IntegrationChannelMembershipRemovedEvent) -> Self {
            Self::MembershipRemovedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMessagesSyncedEvent> for ServerEvent {
        fn from(value: IntegrationChannelMessagesSyncedEvent) -> Self {
            Self::MessagesSyncedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelPresenceUpdatedEvent> for ServerEvent {
        fn from(value: IntegrationChannelPresenceUpdatedEvent) -> Self {
            Self::PresenceUpdatedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelRemoteCreatedEvent> for ServerEvent {
        fn from(value: IntegrationChannelRemoteCreatedEvent) -> Self {
            Self::RemoteCreatedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelRemoteDeletedEvent> for ServerEvent {
        fn from(value: IntegrationChannelRemoteDeletedEvent) -> Self {
            Self::RemoteDeletedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelRemoteUpdatedEvent> for ServerEvent {
        fn from(value: IntegrationChannelRemoteUpdatedEvent) -> Self {
            Self::RemoteUpdatedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelRemotesSyncedEvent> for ServerEvent {
        fn from(value: IntegrationChannelRemotesSyncedEvent) -> Self {
            Self::RemotesSyncedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelSyncCompletedEvent> for ServerEvent {
        fn from(value: IntegrationChannelSyncCompletedEvent) -> Self {
            Self::SyncCompletedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelSyncProgressEvent> for ServerEvent {
        fn from(value: IntegrationChannelSyncProgressEvent) -> Self {
            Self::SyncProgressEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelSyncStartedEvent> for ServerEvent {
        fn from(value: IntegrationChannelSyncStartedEvent) -> Self {
            Self::SyncStartedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMessageDeliveredEvent> for ServerEvent {
        fn from(value: IntegrationChannelMessageDeliveredEvent) -> Self {
            Self::MessageDeliveredEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMessageReceivedEvent> for ServerEvent {
        fn from(value: IntegrationChannelMessageReceivedEvent) -> Self {
            Self::MessageReceivedEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelMessageSeenEvent> for ServerEvent {
        fn from(value: IntegrationChannelMessageSeenEvent) -> Self {
            Self::MessageSeenEvent(value)
        }
    }
    impl ::std::convert::From<IntegrationChannelSpecialPlatformEventReceivedEvent>
    for ServerEvent {
        fn from(value: IntegrationChannelSpecialPlatformEventReceivedEvent) -> Self {
            Self::SpecialPlatformEventReceivedEvent(value)
        }
    }
    ///`ServerEventName`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "string",
    ///  "enum": [
    ///    "integration.channel.chat_presence_updated",
    ///    "integration.channel.connected",
    ///    "integration.channel.disconnected",
    ///    "integration.channel.logged_out",
    ///    "integration.channel.membership_added",
    ///    "integration.channel.membership_removed",
    ///    "integration.channel.messages_synced",
    ///    "integration.channel.presence_updated",
    ///    "integration.channel.remote_created",
    ///    "integration.channel.remote_deleted",
    ///    "integration.channel.remote_updated",
    ///    "integration.channel.remotes_synced",
    ///    "integration.channel.sync_completed",
    ///    "integration.channel.sync_progress",
    ///    "integration.channel.sync_started",
    ///    "integration.channel_message.delivered",
    ///    "integration.channel_message.received",
    ///    "integration.channel_message.seen",
    ///    "integration.channel_special_platform_event.received"
    ///  ],
    ///  "x-enum-varnames": [
    ///    "IntegrationChannelChatPresenceUpdated",
    ///    "IntegrationChannelConnected",
    ///    "IntegrationChannelDisconnected",
    ///    "IntegrationChannelLoggedOut",
    ///    "IntegrationChannelMembershipAdded",
    ///    "IntegrationChannelMembershipRemoved",
    ///    "IntegrationChannelMessagesSynced",
    ///    "IntegrationChannelPresenceUpdated",
    ///    "IntegrationChannelRemoteCreated",
    ///    "IntegrationChannelRemoteDeleted",
    ///    "IntegrationChannelRemoteUpdated",
    ///    "IntegrationChannelRemotesSynced",
    ///    "IntegrationChannelSyncCompleted",
    ///    "IntegrationChannelSyncProgress",
    ///    "IntegrationChannelSyncStarted",
    ///    "IntegrationChannelMessageDelivered",
    ///    "IntegrationChannelMessageReceived",
    ///    "IntegrationChannelMessageSeen",
    ///    "IntegrationChannelSpecialPlatformEventReceived"
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
    pub enum ServerEventName {
        #[serde(rename = "integration.channel.chat_presence_updated")]
        IntegrationChannelChatPresenceUpdated,
        #[serde(rename = "integration.channel.connected")]
        IntegrationChannelConnected,
        #[serde(rename = "integration.channel.disconnected")]
        IntegrationChannelDisconnected,
        #[serde(rename = "integration.channel.logged_out")]
        IntegrationChannelLoggedOut,
        #[serde(rename = "integration.channel.membership_added")]
        IntegrationChannelMembershipAdded,
        #[serde(rename = "integration.channel.membership_removed")]
        IntegrationChannelMembershipRemoved,
        #[serde(rename = "integration.channel.messages_synced")]
        IntegrationChannelMessagesSynced,
        #[serde(rename = "integration.channel.presence_updated")]
        IntegrationChannelPresenceUpdated,
        #[serde(rename = "integration.channel.remote_created")]
        IntegrationChannelRemoteCreated,
        #[serde(rename = "integration.channel.remote_deleted")]
        IntegrationChannelRemoteDeleted,
        #[serde(rename = "integration.channel.remote_updated")]
        IntegrationChannelRemoteUpdated,
        #[serde(rename = "integration.channel.remotes_synced")]
        IntegrationChannelRemotesSynced,
        #[serde(rename = "integration.channel.sync_completed")]
        IntegrationChannelSyncCompleted,
        #[serde(rename = "integration.channel.sync_progress")]
        IntegrationChannelSyncProgress,
        #[serde(rename = "integration.channel.sync_started")]
        IntegrationChannelSyncStarted,
        #[serde(rename = "integration.channel_message.delivered")]
        IntegrationChannelMessageDelivered,
        #[serde(rename = "integration.channel_message.received")]
        IntegrationChannelMessageReceived,
        #[serde(rename = "integration.channel_message.seen")]
        IntegrationChannelMessageSeen,
        #[serde(rename = "integration.channel_special_platform_event.received")]
        IntegrationChannelSpecialPlatformEventReceived,
    }
    impl ::std::convert::From<&Self> for ServerEventName {
        fn from(value: &ServerEventName) -> Self {
            value.clone()
        }
    }
    impl ::std::fmt::Display for ServerEventName {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
            match *self {
                Self::IntegrationChannelChatPresenceUpdated => {
                    f.write_str("integration.channel.chat_presence_updated")
                }
                Self::IntegrationChannelConnected => {
                    f.write_str("integration.channel.connected")
                }
                Self::IntegrationChannelDisconnected => {
                    f.write_str("integration.channel.disconnected")
                }
                Self::IntegrationChannelLoggedOut => {
                    f.write_str("integration.channel.logged_out")
                }
                Self::IntegrationChannelMembershipAdded => {
                    f.write_str("integration.channel.membership_added")
                }
                Self::IntegrationChannelMembershipRemoved => {
                    f.write_str("integration.channel.membership_removed")
                }
                Self::IntegrationChannelMessagesSynced => {
                    f.write_str("integration.channel.messages_synced")
                }
                Self::IntegrationChannelPresenceUpdated => {
                    f.write_str("integration.channel.presence_updated")
                }
                Self::IntegrationChannelRemoteCreated => {
                    f.write_str("integration.channel.remote_created")
                }
                Self::IntegrationChannelRemoteDeleted => {
                    f.write_str("integration.channel.remote_deleted")
                }
                Self::IntegrationChannelRemoteUpdated => {
                    f.write_str("integration.channel.remote_updated")
                }
                Self::IntegrationChannelRemotesSynced => {
                    f.write_str("integration.channel.remotes_synced")
                }
                Self::IntegrationChannelSyncCompleted => {
                    f.write_str("integration.channel.sync_completed")
                }
                Self::IntegrationChannelSyncProgress => {
                    f.write_str("integration.channel.sync_progress")
                }
                Self::IntegrationChannelSyncStarted => {
                    f.write_str("integration.channel.sync_started")
                }
                Self::IntegrationChannelMessageDelivered => {
                    f.write_str("integration.channel_message.delivered")
                }
                Self::IntegrationChannelMessageReceived => {
                    f.write_str("integration.channel_message.received")
                }
                Self::IntegrationChannelMessageSeen => {
                    f.write_str("integration.channel_message.seen")
                }
                Self::IntegrationChannelSpecialPlatformEventReceived => {
                    f.write_str("integration.channel_special_platform_event.received")
                }
            }
        }
    }
    impl ::std::str::FromStr for ServerEventName {
        type Err = self::error::ConversionError;
        fn from_str(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            match value {
                "integration.channel.chat_presence_updated" => {
                    Ok(Self::IntegrationChannelChatPresenceUpdated)
                }
                "integration.channel.connected" => Ok(Self::IntegrationChannelConnected),
                "integration.channel.disconnected" => {
                    Ok(Self::IntegrationChannelDisconnected)
                }
                "integration.channel.logged_out" => Ok(Self::IntegrationChannelLoggedOut),
                "integration.channel.membership_added" => {
                    Ok(Self::IntegrationChannelMembershipAdded)
                }
                "integration.channel.membership_removed" => {
                    Ok(Self::IntegrationChannelMembershipRemoved)
                }
                "integration.channel.messages_synced" => {
                    Ok(Self::IntegrationChannelMessagesSynced)
                }
                "integration.channel.presence_updated" => {
                    Ok(Self::IntegrationChannelPresenceUpdated)
                }
                "integration.channel.remote_created" => {
                    Ok(Self::IntegrationChannelRemoteCreated)
                }
                "integration.channel.remote_deleted" => {
                    Ok(Self::IntegrationChannelRemoteDeleted)
                }
                "integration.channel.remote_updated" => {
                    Ok(Self::IntegrationChannelRemoteUpdated)
                }
                "integration.channel.remotes_synced" => {
                    Ok(Self::IntegrationChannelRemotesSynced)
                }
                "integration.channel.sync_completed" => {
                    Ok(Self::IntegrationChannelSyncCompleted)
                }
                "integration.channel.sync_progress" => {
                    Ok(Self::IntegrationChannelSyncProgress)
                }
                "integration.channel.sync_started" => {
                    Ok(Self::IntegrationChannelSyncStarted)
                }
                "integration.channel_message.delivered" => {
                    Ok(Self::IntegrationChannelMessageDelivered)
                }
                "integration.channel_message.received" => {
                    Ok(Self::IntegrationChannelMessageReceived)
                }
                "integration.channel_message.seen" => {
                    Ok(Self::IntegrationChannelMessageSeen)
                }
                "integration.channel_special_platform_event.received" => {
                    Ok(Self::IntegrationChannelSpecialPlatformEventReceived)
                }
                _ => Err("invalid value".into()),
            }
        }
    }
    impl ::std::convert::TryFrom<&str> for ServerEventName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &str,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<&::std::string::String> for ServerEventName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: &::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    impl ::std::convert::TryFrom<::std::string::String> for ServerEventName {
        type Error = self::error::ConversionError;
        fn try_from(
            value: ::std::string::String,
        ) -> ::std::result::Result<Self, self::error::ConversionError> {
            value.parse()
        }
    }
    ///`SetPresenceBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "presence"
    ///  ],
    ///  "properties": {
    ///    "presence": {
    ///      "$ref": "#/components/schemas/PresenceType"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct SetPresenceBody {
        pub presence: ::codedm_contracts_rust::wire::enums::PresenceType,
    }
    impl ::std::convert::From<&SetPresenceBody> for SetPresenceBody {
        fn from(value: &SetPresenceBody) -> Self {
            value.clone()
        }
    }
    ///`StickerMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "fileLength": {
    ///      "type": "integer"
    ///    },
    ///    "isAnimated": {
    ///      "type": "boolean"
    ///    },
    ///    "mimetype": {
    ///      "type": "string"
    ///    },
    ///    "pngThumbnail": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "integer"
    ///      }
    ///    },
    ///    "url": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct StickerMessageData {
        #[serde(
            rename = "fileLength",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_length: ::std::option::Option<i64>,
        #[serde(
            rename = "isAnimated",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub is_animated: ::std::option::Option<bool>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub mimetype: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "pngThumbnail",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub png_thumbnail: ::std::vec::Vec<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub url: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&StickerMessageData> for StickerMessageData {
        fn from(value: &StickerMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for StickerMessageData {
        fn default() -> Self {
            Self {
                file_length: Default::default(),
                is_animated: Default::default(),
                mimetype: Default::default(),
                png_thumbnail: Default::default(),
                url: Default::default(),
            }
        }
    }
    ///`UnarchiveRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UnarchiveRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&UnarchiveRemoteBody> for UnarchiveRemoteBody {
        fn from(value: &UnarchiveRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`UnmuteRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UnmuteRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&UnmuteRemoteBody> for UnmuteRemoteBody {
        fn from(value: &UnmuteRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`UnpinRemoteBody`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "channelId",
    ///    "remoteId"
    ///  ],
    ///  "properties": {
    ///    "channelId": {
    ///      "examples": [
    ///        "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    ///      ],
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "examples": [
    ///        "5511999999999@s.whatsapp.net"
    ///      ],
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct UnpinRemoteBody {
        #[serde(rename = "channelId")]
        pub channel_id: ::std::string::String,
        #[serde(rename = "remoteId")]
        pub remote_id: ::std::string::String,
    }
    impl ::std::convert::From<&UnpinRemoteBody> for UnpinRemoteBody {
        fn from(value: &UnpinRemoteBody) -> Self {
            value.clone()
        }
    }
    ///`VideoMessageData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "caption": {
    ///      "type": "string"
    ///    },
    ///    "fileLength": {
    ///      "type": "integer"
    ///    },
    ///    "jpegThumbnail": {
    ///      "type": "array",
    ///      "items": {
    ///        "type": "integer"
    ///      }
    ///    },
    ///    "mimetype": {
    ///      "type": "string"
    ///    },
    ///    "seconds": {
    ///      "type": "integer"
    ///    },
    ///    "url": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct VideoMessageData {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub caption: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "fileLength",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub file_length: ::std::option::Option<i64>,
        #[serde(
            rename = "jpegThumbnail",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        pub jpeg_thumbnail: ::std::vec::Vec<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub mimetype: ::std::option::Option<::std::string::String>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub seconds: ::std::option::Option<i64>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub url: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&VideoMessageData> for VideoMessageData {
        fn from(value: &VideoMessageData) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for VideoMessageData {
        fn default() -> Self {
            Self {
                caption: Default::default(),
                file_length: Default::default(),
                jpeg_thumbnail: Default::default(),
                mimetype: Default::default(),
                seconds: Default::default(),
                url: Default::default(),
            }
        }
    }
    ///`WhatsAppAudioContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "audioMessage"
    ///  ],
    ///  "properties": {
    ///    "audioMessage": {
    ///      "$ref": "#/components/schemas/AudioMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppAudioContent {
        #[serde(rename = "audioMessage")]
        pub audio_message: AudioMessageData,
    }
    impl ::std::convert::From<&WhatsAppAudioContent> for WhatsAppAudioContent {
        fn from(value: &WhatsAppAudioContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppChannelMessageReceivedPlatformData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "isEphemeral",
    ///    "isGroup",
    ///    "isViewOnce",
    ///    "pushName"
    ///  ],
    ///  "properties": {
    ///    "isEphemeral": {
    ///      "type": "boolean"
    ///    },
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    },
    ///    "isViewOnce": {
    ///      "type": "boolean"
    ///    },
    ///    "pushName": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppChannelMessageReceivedPlatformData {
        #[serde(rename = "isEphemeral")]
        pub is_ephemeral: bool,
        #[serde(rename = "isGroup")]
        pub is_group: bool,
        #[serde(rename = "isViewOnce")]
        pub is_view_once: bool,
        #[serde(rename = "pushName")]
        pub push_name: ::std::string::String,
    }
    impl ::std::convert::From<&WhatsAppChannelMessageReceivedPlatformData>
    for WhatsAppChannelMessageReceivedPlatformData {
        fn from(value: &WhatsAppChannelMessageReceivedPlatformData) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppChannelMessageSentPlatformData`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "isGroup"
    ///  ],
    ///  "properties": {
    ///    "isGroup": {
    ///      "type": "boolean"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppChannelMessageSentPlatformData {
        #[serde(rename = "isGroup")]
        pub is_group: bool,
    }
    impl ::std::convert::From<&WhatsAppChannelMessageSentPlatformData>
    for WhatsAppChannelMessageSentPlatformData {
        fn from(value: &WhatsAppChannelMessageSentPlatformData) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppContactContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "contactMessage": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ContactMessageData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "contacts": {
    ///      "type": "array",
    ///      "items": {
    ///        "$ref": "#/components/schemas/ContactData"
    ///      }
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppContactContent {
        #[serde(
            rename = "contactMessage",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub contact_message: ::std::option::Option<ContactMessageData>,
        #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
        pub contacts: ::std::vec::Vec<ContactData>,
    }
    impl ::std::convert::From<&WhatsAppContactContent> for WhatsAppContactContent {
        fn from(value: &WhatsAppContactContent) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for WhatsAppContactContent {
        fn default() -> Self {
            Self {
                contact_message: Default::default(),
                contacts: Default::default(),
            }
        }
    }
    ///`WhatsAppContextInfo`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "participant": {
    ///      "type": "string"
    ///    },
    ///    "quotedMessageContent": {
    ///      "x-unknown": true
    ///    },
    ///    "quotedMessageType": {
    ///      "type": "string"
    ///    },
    ///    "quotedSenderName": {
    ///      "type": "string"
    ///    },
    ///    "stanzaId": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppContextInfo {
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub participant: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "quotedMessageContent",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub quoted_message_content: ::std::option::Option<::serde_json::Value>,
        #[serde(
            rename = "quotedMessageType",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub quoted_message_type: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "quotedSenderName",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub quoted_sender_name: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "stanzaId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub stanza_id: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&WhatsAppContextInfo> for WhatsAppContextInfo {
        fn from(value: &WhatsAppContextInfo) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for WhatsAppContextInfo {
        fn default() -> Self {
            Self {
                participant: Default::default(),
                quoted_message_content: Default::default(),
                quoted_message_type: Default::default(),
                quoted_sender_name: Default::default(),
                stanza_id: Default::default(),
            }
        }
    }
    ///`WhatsAppCredentials`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "properties": {
    ///    "deviceJid": {
    ///      "type": "string"
    ///    },
    ///    "ownerJid": {
    ///      "type": "string"
    ///    },
    ///    "phoneNumber": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppCredentials {
        #[serde(
            rename = "deviceJid",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub device_jid: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "ownerJid",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub owner_jid: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "phoneNumber",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub phone_number: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&WhatsAppCredentials> for WhatsAppCredentials {
        fn from(value: &WhatsAppCredentials) -> Self {
            value.clone()
        }
    }
    impl ::std::default::Default for WhatsAppCredentials {
        fn default() -> Self {
            Self {
                device_jid: Default::default(),
                owner_jid: Default::default(),
                phone_number: Default::default(),
            }
        }
    }
    ///`WhatsAppDocumentContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "documentMessage"
    ///  ],
    ///  "properties": {
    ///    "documentMessage": {
    ///      "$ref": "#/components/schemas/DocumentMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppDocumentContent {
        #[serde(rename = "documentMessage")]
        pub document_message: DocumentMessageData,
    }
    impl ::std::convert::From<&WhatsAppDocumentContent> for WhatsAppDocumentContent {
        fn from(value: &WhatsAppDocumentContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppImageContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "imageMessage"
    ///  ],
    ///  "properties": {
    ///    "imageMessage": {
    ///      "$ref": "#/components/schemas/ImageMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppImageContent {
        #[serde(rename = "imageMessage")]
        pub image_message: ImageMessageData,
    }
    impl ::std::convert::From<&WhatsAppImageContent> for WhatsAppImageContent {
        fn from(value: &WhatsAppImageContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppLocationContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "locationMessage"
    ///  ],
    ///  "properties": {
    ///    "locationMessage": {
    ///      "$ref": "#/components/schemas/LocationMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppLocationContent {
        #[serde(rename = "locationMessage")]
        pub location_message: LocationMessageData,
    }
    impl ::std::convert::From<&WhatsAppLocationContent> for WhatsAppLocationContent {
        fn from(value: &WhatsAppLocationContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppPollContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "pollMessage"
    ///  ],
    ///  "properties": {
    ///    "pollMessage": {
    ///      "$ref": "#/components/schemas/PollMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppPollContent {
        #[serde(rename = "pollMessage")]
        pub poll_message: PollMessageData,
    }
    impl ::std::convert::From<&WhatsAppPollContent> for WhatsAppPollContent {
        fn from(value: &WhatsAppPollContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppQrCodeUpdated`
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
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppQrCodeUpdated {
        pub code: ::std::string::String,
    }
    impl ::std::convert::From<&WhatsAppQrCodeUpdated> for WhatsAppQrCodeUpdated {
        fn from(value: &WhatsAppQrCodeUpdated) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppReactionContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "reactionMessage"
    ///  ],
    ///  "properties": {
    ///    "reactionMessage": {
    ///      "$ref": "#/components/schemas/ReactionMessageData"
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppReactionContent {
        #[serde(rename = "reactionMessage")]
        pub reaction_message: ReactionMessageData,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub text: ::std::option::Option<::std::string::String>,
    }
    impl ::std::convert::From<&WhatsAppReactionContent> for WhatsAppReactionContent {
        fn from(value: &WhatsAppReactionContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppStickerContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "stickerMessage"
    ///  ],
    ///  "properties": {
    ///    "stickerMessage": {
    ///      "$ref": "#/components/schemas/StickerMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppStickerContent {
        #[serde(rename = "stickerMessage")]
        pub sticker_message: StickerMessageData,
    }
    impl ::std::convert::From<&WhatsAppStickerContent> for WhatsAppStickerContent {
        fn from(value: &WhatsAppStickerContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppTextContent`
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
    ///    "contextInfo": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/WhatsAppContextInfo"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "extendedTextMessage": {
    ///      "oneOf": [
    ///        {
    ///          "type": "null"
    ///        },
    ///        {
    ///          "allOf": [
    ///            {
    ///              "$ref": "#/components/schemas/ExtendedTextData"
    ///            }
    ///          ]
    ///        }
    ///      ]
    ///    },
    ///    "forward": {
    ///      "type": "boolean"
    ///    },
    ///    "messageId": {
    ///      "type": "string"
    ///    },
    ///    "remoteId": {
    ///      "type": "string"
    ///    },
    ///    "text": {
    ///      "type": "string"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppTextContent {
        #[serde(
            rename = "contextInfo",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub context_info: ::std::option::Option<WhatsAppContextInfo>,
        #[serde(
            rename = "extendedTextMessage",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub extended_text_message: ::std::option::Option<ExtendedTextData>,
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
        pub forward: ::std::option::Option<bool>,
        #[serde(
            rename = "messageId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub message_id: ::std::option::Option<::std::string::String>,
        #[serde(
            rename = "remoteId",
            default,
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        pub remote_id: ::std::option::Option<::std::string::String>,
        pub text: ::std::string::String,
    }
    impl ::std::convert::From<&WhatsAppTextContent> for WhatsAppTextContent {
        fn from(value: &WhatsAppTextContent) -> Self {
            value.clone()
        }
    }
    ///`WhatsAppVideoContent`
    ///
    /// <details><summary>JSON schema</summary>
    ///
    /// ```json
    ///{
    ///  "type": "object",
    ///  "required": [
    ///    "videoMessage"
    ///  ],
    ///  "properties": {
    ///    "videoMessage": {
    ///      "$ref": "#/components/schemas/VideoMessageData"
    ///    }
    ///  }
    ///}
    /// ```
    /// </details>
    #[derive(::serde::Deserialize, ::serde::Serialize, Clone, Debug)]
    pub struct WhatsAppVideoContent {
        #[serde(rename = "videoMessage")]
        pub video_message: VideoMessageData,
    }
    impl ::std::convert::From<&WhatsAppVideoContent> for WhatsAppVideoContent {
        fn from(value: &WhatsAppVideoContent) -> Self {
            value.clone()
        }
    }
}
#[derive(Clone, Debug)]
/**Client for Gateway API

Gateway service API — emitted by api-go/pkg/openapi

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
    /**List channels

Sends a `GET` request to `/channel/channels`

*/
    pub async fn list_channels<'a>(
        &'a self,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<ResponseValue<types::ListChannelsOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/channels", self.baseurl,);
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
            .query(&progenitor_client::QueryParam::new("limit", &limit))
            .query(&progenitor_client::QueryParam::new("offset", &offset))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Get or create channel for current tenant and platform

Sends a `GET` request to `/channel/channels/resolve`

*/
    pub async fn get_or_create_channel<'a>(
        &'a self,
        platform: &'a ::codedm_contracts_rust::wire::enums::ChannelKind,
    ) -> Result<
        ResponseValue<types::GetOrCreateChannelOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!("{}/channel/channels/resolve", self.baseurl,);
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
            .query(&progenitor_client::QueryParam::new("platform", &platform))
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Create a new WhatsApp channel

Sends a `POST` request to `/channel/channels/whatsapp`

*/
    pub async fn create_whats_app_channel<'a>(
        &'a self,
        body: &'a types::CreateWhatsAppChannelBody,
    ) -> Result<ResponseValue<types::CreateChannelOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/channels/whatsapp", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Get channel by ID

Sends a `GET` request to `/channel/channels/{id}`

*/
    pub async fn get_channel<'a>(
        &'a self,
        id: &'a str,
    ) -> Result<ResponseValue<types::GetChannelOutput>, Error<types::ErrorResponse>> {
        let url = format!(
            "{}/channel/channels/{}", self.baseurl, encode_path(& id.to_string()),
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Delete a channel

Sends a `DELETE` request to `/channel/channels/{id}`

*/
    pub async fn delete_channel<'a>(
        &'a self,
        id: &'a str,
    ) -> Result<ResponseValue<types::DeleteChannelOutput>, Error<types::ErrorResponse>> {
        let url = format!(
            "{}/channel/channels/{}", self.baseurl, encode_path(& id.to_string()),
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Connect channel (returns QR code)

Sends a `POST` request to `/channel/channels/{id}/connect`

*/
    pub async fn connect_channel<'a>(
        &'a self,
        id: &'a str,
    ) -> Result<
        ResponseValue<types::ConnectChannelOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!(
            "{}/channel/channels/{}/connect", self.baseurl, encode_path(& id
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Logout channel

Sends a `DELETE` request to `/channel/channels/{id}/logout`

*/
    pub async fn logout_channel<'a>(
        &'a self,
        id: &'a str,
    ) -> Result<ResponseValue<types::LogoutChannelOutput>, Error<types::ErrorResponse>> {
        let url = format!(
            "{}/channel/channels/{}/logout", self.baseurl, encode_path(& id.to_string()),
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Set channel presence

Sends a `PUT` request to `/channel/channels/{id}/presence`

*/
    pub async fn set_presence<'a>(
        &'a self,
        id: &'a str,
        body: &'a types::SetPresenceBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!(
            "{}/channel/channels/{}/presence", self.baseurl, encode_path(& id
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Restart channel connection

Sends a `POST` request to `/channel/channels/{id}/restart`

*/
    pub async fn restart_channel<'a>(
        &'a self,
        id: &'a str,
    ) -> Result<
        ResponseValue<types::RestartChannelOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!(
            "{}/channel/channels/{}/restart", self.baseurl, encode_path(& id
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Archive a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/archive`

*/
    pub async fn archive_remote<'a>(
        &'a self,
        body: &'a types::ArchiveRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/archive", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Mark a remote chat as seen on the connected platform

Sends a `POST` request to `/channel/remotes/mark-as-seen`

*/
    pub async fn mark_remote_as_seen<'a>(
        &'a self,
        body: &'a types::MarkRemoteAsSeenBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/mark-as-seen", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Mark a remote chat as unread on the connected platform

Sends a `POST` request to `/channel/remotes/mark-as-unread`

*/
    pub async fn mark_remote_as_unread<'a>(
        &'a self,
        body: &'a types::MarkRemoteAsUnreadBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/mark-as-unread", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Mute a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/mute`

*/
    pub async fn mute_remote<'a>(
        &'a self,
        body: &'a types::MuteRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/mute", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Pin a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/pin`

*/
    pub async fn pin_remote<'a>(
        &'a self,
        body: &'a types::PinRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/pin", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Unarchive a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/unarchive`

*/
    pub async fn unarchive_remote<'a>(
        &'a self,
        body: &'a types::UnarchiveRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/unarchive", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Unmute a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/unmute`

*/
    pub async fn unmute_remote<'a>(
        &'a self,
        body: &'a types::UnmuteRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/unmute", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Unpin a remote chat on the connected platform

Sends a `POST` request to `/channel/remotes/unpin`

*/
    pub async fn unpin_remote<'a>(
        &'a self,
        body: &'a types::UnpinRemoteBody,
    ) -> Result<ResponseValue<()>, Error<types::ErrorResponse>> {
        let url = format!("{}/channel/remotes/unpin", self.baseurl,);
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
            204u16 => Ok(ResponseValue::empty(response)),
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Listen to events via SSE

Sends a `GET` request to `/events`

*/
    pub async fn listen_events<'a>(
        &'a self,
    ) -> Result<ResponseValue<types::ServerEvent>, Error<types::ErrorResponse>> {
        let url = format!("{}/events", self.baseurl,);
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send an audio message

Sends a `POST` request to `/messaging/messages/audio`

*/
    pub async fn send_audio<'a>(
        &'a self,
        body: &'a types::SendAudioBody,
    ) -> Result<ResponseValue<types::SendAudioOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/audio", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a button message

Sends a `POST` request to `/messaging/messages/button`

*/
    pub async fn send_button<'a>(
        &'a self,
        body: &'a types::SendButtonBody,
    ) -> Result<ResponseValue<types::SendButtonOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/button", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Check if identifiers are on the platform

Sends a `POST` request to `/messaging/messages/check-number`

*/
    pub async fn check_is_on_platform<'a>(
        &'a self,
        body: &'a types::CheckIsOnPlatformBody,
    ) -> Result<
        ResponseValue<types::CheckIsOnPlatformOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!("{}/messaging/messages/check-number", self.baseurl,);
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a contact card message

Sends a `POST` request to `/messaging/messages/contact`

*/
    pub async fn send_contact<'a>(
        &'a self,
        body: &'a types::SendContactBody,
    ) -> Result<ResponseValue<types::SendContactOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/contact", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Delete a message

Sends a `DELETE` request to `/messaging/messages/delete`

*/
    pub async fn delete_message<'a>(
        &'a self,
        body: &'a types::DeleteMessageBody,
    ) -> Result<ResponseValue<types::DeleteMessageOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/delete", self.baseurl,);
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
            .json(&body)
            .headers(header_map)
            .build()?;
        let result = self.client.execute(request).await;
        let response = result?;
        match response.status().as_u16() {
            200u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Edit an existing message

Sends a `PUT` request to `/messaging/messages/edit`

*/
    pub async fn edit_message<'a>(
        &'a self,
        body: &'a types::EditMessageBody,
    ) -> Result<ResponseValue<types::EditMessageOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/edit", self.baseurl,);
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a file/document message

Sends a `POST` request to `/messaging/messages/file`

*/
    pub async fn send_file<'a>(
        &'a self,
        body: &'a types::SendFileBody,
    ) -> Result<ResponseValue<types::SendFileOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/file", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Forward a message to another chat

Sends a `POST` request to `/messaging/messages/forward`

*/
    pub async fn forward_message<'a>(
        &'a self,
        body: &'a types::ForwardMessageBody,
    ) -> Result<
        ResponseValue<types::ForwardMessageOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!("{}/messaging/messages/forward", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send an image message

Sends a `POST` request to `/messaging/messages/image`

*/
    pub async fn send_image<'a>(
        &'a self,
        body: &'a types::SendImageBody,
    ) -> Result<ResponseValue<types::SendImageOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/image", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a link with preview

Sends a `POST` request to `/messaging/messages/link`

*/
    pub async fn send_link<'a>(
        &'a self,
        body: &'a types::SendLinkBody,
    ) -> Result<ResponseValue<types::SendLinkOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/link", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a list message

Sends a `POST` request to `/messaging/messages/list`

*/
    pub async fn send_list<'a>(
        &'a self,
        body: &'a types::SendListBody,
    ) -> Result<ResponseValue<types::SendListOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/list", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a location message

Sends a `POST` request to `/messaging/messages/location`

*/
    pub async fn send_location<'a>(
        &'a self,
        body: &'a types::SendLocationBody,
    ) -> Result<ResponseValue<types::SendLocationOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/location", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a media message

Sends a `POST` request to `/messaging/messages/media`

*/
    pub async fn send_media<'a>(
        &'a self,
        body: &'a types::SendMediaBody,
    ) -> Result<ResponseValue<types::SendMediaOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/media", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a poll message

Sends a `POST` request to `/messaging/messages/poll`

*/
    pub async fn send_poll<'a>(
        &'a self,
        body: &'a types::SendPollBody,
    ) -> Result<ResponseValue<types::SendPollOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/poll", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send chat presence indicator

Sends a `POST` request to `/messaging/messages/presence`

*/
    pub async fn send_chat_presence<'a>(
        &'a self,
        body: &'a types::SendChatPresenceBody,
    ) -> Result<
        ResponseValue<types::SendChatPresenceOutput>,
        Error<types::ErrorResponse>,
    > {
        let url = format!("{}/messaging/messages/presence", self.baseurl,);
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a reaction to a message

Sends a `POST` request to `/messaging/messages/reaction`

*/
    pub async fn send_reaction<'a>(
        &'a self,
        body: &'a types::SendReactionBody,
    ) -> Result<ResponseValue<types::SendReactionOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/reaction", self.baseurl,);
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
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a status/story update

Sends a `POST` request to `/messaging/messages/status`

*/
    pub async fn send_status<'a>(
        &'a self,
        body: &'a types::SendStatusBody,
    ) -> Result<ResponseValue<types::SendStatusOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/status", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a sticker message

Sends a `POST` request to `/messaging/messages/sticker`

*/
    pub async fn send_sticker<'a>(
        &'a self,
        body: &'a types::SendStickerBody,
    ) -> Result<ResponseValue<types::SendStickerOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/sticker", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a text message

Sends a `POST` request to `/messaging/messages/text`

*/
    pub async fn send_text<'a>(
        &'a self,
        body: &'a types::SendTextBody,
    ) -> Result<ResponseValue<types::SendTextOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/text", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
    /**Send a video message

Sends a `POST` request to `/messaging/messages/video`

*/
    pub async fn send_video<'a>(
        &'a self,
        body: &'a types::SendVideoBody,
    ) -> Result<ResponseValue<types::SendVideoOutput>, Error<types::ErrorResponse>> {
        let url = format!("{}/messaging/messages/video", self.baseurl,);
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
            201u16 => ResponseValue::from_response(response).await,
            400u16..=499u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            500u16..=599u16 => {
                Err(Error::ErrorResponse(ResponseValue::from_response(response).await?))
            }
            _ => Err(Error::UnexpectedResponse(response)),
        }
    }
}
/// Items consumers will typically use such as the Client.
pub mod prelude {
    #[allow(unused_imports)]
    pub use super::Client;
}
