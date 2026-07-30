//! Union-slot manifest rail — pins the PILOT event's generated metadata, mirroring the
//! Go/TS union-parity checks (13 variants across the two slots, single owner apiGo).
//! If the contract's @unionSlot/@variant declarations change, this pins the regen.

use codm_contracts_rust::wire::slots::CHANNEL_MESSAGE_RECEIVED_EVENT_SLOTS;

#[test]
fn pilot_manifest_carries_both_slots_with_all_declared_variants() {
    let slots = CHANNEL_MESSAGE_RECEIVED_EVENT_SLOTS;
    assert_eq!(slots.len(), 2, "pilot declares content + platformData");

    let content = slots.iter().find(|s| s.field == "content").expect("content slot");
    assert_eq!(content.discriminators, ["platform", "messageType"]);
    assert_eq!(content.variants.len(), 11, "union-parity pin: 11 content variants");

    let platform_data = slots.iter().find(|s| s.field == "platformData").expect("platformData slot");
    assert_eq!(platform_data.discriminators, ["platform"]);
    assert_eq!(platform_data.variants.len(), 2, "union-parity pin: 2 platformData variants");

    // Every variant resolves to exactly one owner workspace (materialization precondition).
    for slot in slots {
        for v in slot.variants {
            assert_eq!(v.owner, "apiGo", "pilot variants are owned by apiGo");
            assert_eq!(v.values.len(), slot.discriminators.len(), "positional values zip with discriminators");
            assert!(!v.type_name.is_empty());
        }
    }
}
