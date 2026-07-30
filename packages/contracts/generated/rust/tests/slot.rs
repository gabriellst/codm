//! `Slot<T>` behavior rail — the forward-compat semantics of union slots (spec §2.5),
//! proven at the serde level with a stand-in for an owner-client shape.

use codm_contracts_rust::slot::Slot;

/// Stand-in for a progenitor-generated owner aggregate: untagged over variants whose
/// single-value discriminator enums make matching semantic (the exact shape the spike
/// measured out of progenitor 0.10).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
enum Content {
    Text {
        #[serde(rename = "messageType")]
        message_type: TextTag,
        text: String
    },
    Image {
        #[serde(rename = "messageType")]
        message_type: ImageTag,
        url: String,
    },
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
enum TextTag {
    #[serde(rename = "TEXT")]
    Text,
}
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
enum ImageTag {
    #[serde(rename = "IMAGE")]
    Image,
}

#[test]
fn known_variant_decodes_into_the_owner_shape() {
    let raw = serde_json::json!({ "messageType": "TEXT", "text": "hello" });
    let slot: Slot<Content> = Slot::decode(&raw);
    match slot.known() {
        Some(Content::Text { text, .. }) => assert_eq!(text, "hello"),
        other => panic!("expected Known(Text), got {other:?}"),
    }
}

#[test]
fn unknown_discriminator_lands_in_opaque_never_an_error() {
    // A POLL variant this consumer does not know yet — published by a NEWER gateway.
    let raw = serde_json::json!({ "messageType": "POLL", "question": "coffee?" });
    let slot: Slot<Content> = Slot::decode(&raw);
    assert!(!slot.is_known(), "unknown variant must land in Opaque");
    // Lossless passthrough: the consumer can log/forward the frame verbatim.
    let back = serde_json::to_value(&slot).expect("serialize");
    assert_eq!(raw, back);
}

#[test]
fn slot_deserializes_inline_inside_a_payload() {
    // Slot<T> also works as a FIELD type (custom Deserialize), not just via decode().
    #[derive(Debug, serde::Deserialize)]
    struct Payload {
        content: Slot<Content>,
    }
    let known: Payload =
        serde_json::from_value(serde_json::json!({ "content": { "messageType": "IMAGE", "url": "https://x" } }))
            .expect("parse");
    assert!(known.content.is_known());
    let unknown: Payload =
        serde_json::from_value(serde_json::json!({ "content": { "messageType": "VIDEO_NOTE", "u": 1 } }))
            .expect("unknown variant must still parse");
    assert!(!unknown.content.is_known());
}

#[test]
fn known_roundtrips_as_the_shape_itself_untagged() {
    let raw = serde_json::json!({ "messageType": "TEXT", "text": "oi" });
    let slot: Slot<Content> = Slot::decode(&raw);
    let back = serde_json::to_value(&slot).expect("serialize");
    assert_eq!(raw, back, "Known must serialize as the plain shape (untagged)");
}
