// Wire-format wrappers for command parameter / return types whose Specta
// derive would otherwise hit upstream bugs.
//
// `serde_json::Value` is recursive (`Array(Vec<Value>)` calls
// `Vec::<Value>::definition` which re-enters `Value::definition` forever).
// The `specta` crate's `serde_json` feature emits a `definition()` impl that
// stack-overflows during bindings codegen in v2.0.0-rc.25. For now, every
// `serde_json::Value` in a tauri::command signature becomes `JsonValueWire`,
// a transparent newtype that:
//
//   - serialises identically to `serde_json::Value` (serde-transparent), and
//   - implements `specta::Type` as an empty named struct, which renders as
//     `{}` in TypeScript. TypeScript's `{}` accepts any non-nullish value,
//     including arrays, objects, strings, numbers, and booleans — close
//     enough to "any JSON shape" for the dynamic SQL primitives. The
//     renderer-side shim already treats these values as opaque.
//
// When upstream specta lands a non-recursive `Type` impl for
// `serde_json::Value`, we can drop this module and switch the command
// signatures back.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::datatype::{DataType, Struct};
use specta::{Type, Types};

/// Wrapper newtype that round-trips `serde_json::Value` across the IPC
/// boundary while remaining Specta-derivable.
///
/// On the wire: identical bytes to `serde_json::Value` (serde-transparent).
/// In TypeScript: renders as an empty struct `{}` — see module-level docs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct JsonValueWire(pub Value);

impl From<Value> for JsonValueWire {
    fn from(v: Value) -> Self {
        Self(v)
    }
}

impl From<JsonValueWire> for Value {
    fn from(w: JsonValueWire) -> Self {
        w.0
    }
}

impl Type for JsonValueWire {
    fn definition(_types: &mut Types) -> DataType {
        Struct::named().build()
    }
}

/// Convert an `Option<Vec<JsonValueWire>>` (the typical SQL-params shape on
/// the wire) into a `Vec<serde_json::Value>` for the api-layer call.
pub fn unwrap_params(params: Option<Vec<JsonValueWire>>) -> Vec<Value> {
    params
        .unwrap_or_default()
        .into_iter()
        .map(|w| w.0)
        .collect()
}

/// Convert a `Vec<Vec<JsonValueWire>>` (the `db_batch_run` rows shape) into
/// the inner `Vec<Vec<serde_json::Value>>` the api expects.
pub fn unwrap_params_list(rows: Vec<Vec<JsonValueWire>>) -> Vec<Vec<Value>> {
    rows.into_iter()
        .map(|row| row.into_iter().map(|w| w.0).collect())
        .collect()
}
