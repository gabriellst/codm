//! Union-slot runtime support — COMMITTED, not generated (src/wire/* is wiped on regen;
//! this module survives it, like lib.rs).
//!
//! A union slot arrives on the wire as an opaque JSON value (union-slots spec §6: the
//! contract never models variant shapes — they live with the owner workspace and reach
//! consumers through the owner's generated client). `Slot<T>` is the typed door a
//! consumer opens: `T` is the owner-client aggregate (e.g. the progenitor-generated
//! content union of the gateway), and anything `T` does not recognize lands in `Opaque`
//! — **never** a parse failure. That is the forward-compat rule (§2.5): new variants
//! published by another service must not break old consumers; the guard is over the
//! VALUE, and unknown discriminators are log + passthrough.

/// A decoded union slot: the owner-client shape when recognized, the verbatim JSON
/// otherwise. `Opaque` is lossless — re-serializing emits the original value, so a
/// consumer can forward frames it does not understand.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(untagged)]
pub enum Slot<T> {
    Known(T),
    Opaque(serde_json::Value),
}

impl<T: serde::de::DeserializeOwned> Slot<T> {
    /// Decode an opaque slot value into the owner-client shape. Unknown variants land in
    /// `Opaque` (forward-compat), so this never fails on a well-formed JSON value.
    pub fn decode(value: &serde_json::Value) -> Self {
        match serde_json::from_value::<T>(value.clone()) {
            Ok(known) => Slot::Known(known),
            Err(_) => Slot::Opaque(value.clone()),
        }
    }
}

impl<T> Slot<T> {
    pub fn known(&self) -> Option<&T> {
        match self {
            Slot::Known(v) => Some(v),
            Slot::Opaque(_) => None,
        }
    }

    pub fn is_known(&self) -> bool {
        matches!(self, Slot::Known(_))
    }
}

impl<'de, T: serde::de::DeserializeOwned> serde::Deserialize<'de> for Slot<T> {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let raw = serde_json::Value::deserialize(de)?;
        Ok(Slot::decode(&raw))
    }
}
