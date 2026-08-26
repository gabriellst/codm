//! Narrowing rail for the message_received discriminated union — the union-slots PILOT
//! materialized into Rust (spec §3.3): the gateway's openapi oneOf → progenitor union.
//!
//! Pure serde, no live backend. Pins the fix for a REAL defect: the gateway pins
//! discriminators with `const` (house convention), which the 3.0 parser progenitor uses
//! DROPS — every arm degraded to String and untagged matching became STRUCTURAL
//! (an IMAGE message parsed as WhatsappContact; INTERNAL TEXT as WhatsappText). The
//! generator's `constToSingleEnum` transform restores the pins; these cases keep it dead.

use codm_client_rust::go::types::ChannelMessageReceivedPayload as P;
use codm_contracts_rust::slot::Slot;

fn base(msg_type: &str, platform: &str, content: serde_json::Value) -> serde_json::Value {
    let mut v = serde_json::json!({
        "author": "HUMAN", "channelId": "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
        "fromMe": false, "internalMessageId": "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
        "isGroup": false, "messageId": "wamid_1", "remoteId": "551199", "senderId": "551199",
        "observedAt": "2026-07-30T12:00:00Z", "occurredAt": "2026-07-30T12:00:00Z",
        "ownerId": "local", "timestamp": 1704067200, "name": "channel.message_received",
        "messageType": msg_type, "platform": platform
    });
    if !content.is_null() {
        v["content"] = content;
    }
    v
}

#[test]
fn whatsapp_text_narrows_to_the_text_arm_with_typed_content() {
    let parsed: P = serde_json::from_value(base("TEXT", "WHATSAPP", serde_json::json!({"text": "oi"})))
        .expect("parse");
    match parsed {
        P::WhatsappText(arm) => {
            let content = arm.content.expect("content present");
            assert_eq!(content.text, "oi");
        }
        other => panic!("expected WhatsappText, got {other:?}"),
    }
}

#[test]
fn whatsapp_image_narrows_to_the_image_arm_not_a_structural_lookalike() {
    // Regression: before the const→enum fix this parsed as WhatsappContact.
    let content = serde_json::json!({"imageMessage": {"url": "https://x/i.jpg", "mimetype": "image/jpeg", "caption": "foto"}});
    let parsed: P = serde_json::from_value(base("IMAGE", "WHATSAPP", content)).expect("parse");
    assert!(matches!(parsed, P::WhatsappImage(_)), "IMAGE must land in the image arm, got {parsed:?}");
}

#[test]
fn absent_content_still_narrows_by_the_pinned_discriminators() {
    // Regression: before the fix an IMAGE without content fell into the FIRST arm (Text).
    let parsed: P = serde_json::from_value(base("IMAGE", "WHATSAPP", serde_json::Value::Null)).expect("parse");
    assert!(matches!(parsed, P::WhatsappImage(_)), "pin must decide even without content, got {parsed:?}");
}

#[test]
fn internal_platform_narrows_to_the_internal_arm() {
    // Regression: before the fix INTERNAL TEXT parsed as WhatsappText (platform ignored).
    let parsed: P = serde_json::from_value(base("TEXT", "INTERNAL", serde_json::json!({"text": "oi"}))).expect("parse");
    assert!(matches!(parsed, P::InternalText(_)), "platform must discriminate, got {parsed:?}");
}

#[test]
fn unknown_variant_is_forward_compat_via_slot_never_a_hard_failure() {
    // A platform/messageType this consumer does not know: the CLIENT union rightly
    // refuses it — and Slot<P> is the door that turns that refusal into Opaque
    // passthrough (union-slots spec §2.5) instead of a dropped frame.
    let raw = base("VOICE_NOTE_V9", "TELEGRAM", serde_json::json!({"novel": true}));
    assert!(serde_json::from_value::<P>(raw.clone()).is_err(), "closed union must refuse unknown pins");
    let slot: Slot<P> = Slot::decode(&raw);
    assert!(!slot.is_known());
    assert_eq!(serde_json::to_value(&slot).expect("serialize"), raw, "opaque passthrough must be lossless");
}
