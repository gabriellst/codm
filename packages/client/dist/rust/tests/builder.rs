//! Construction rail — the aggregate Client wires one typed sub-client per discovered
//! api SURFACE. Symmetric with the TS/Go SDK aggregates.
//!
//! SURFACE, não serviço, e a distinção passou a importar em 2026-08-14: desde o ADR 0001 o mesmo
//! backend TypeScript publica DUAS superfícies — o daemon local e o deployment de nuvem — e o
//! agregado ganha um sub-cliente para cada. Os nomes vêm do `clientId` (`typescript` ×
//! `typescript_cloud`), nunca do nome do serviço, que é igual nos dois.
//!
//! Este rail PEGOU essa mudança: com a terceira superfície, `build()` passou a exigir uma terceira
//! URL e o teste antigo quebrou. Foi o comportamento correto — é para isso que ele existe.

use codm_client_rust::{BuildError, Client};

#[test]
fn client_builder_constructs() {
    let client = Client::builder()
        .typescript("http://localhost:3030")
        .typescript_cloud("http://localhost:3031")
        .go("http://localhost:3032")
        .build()
        .expect("build");
    // Construction proves the struct shape; nothing to call without a live server.
    let _ = &client.typescript;
    let _ = &client.typescript_cloud;
    let _ = &client.go;
}

#[test]
fn missing_url_fails_loud() {
    let err = Client::builder().typescript("http://localhost:3030").build();
    assert!(err.is_err(), "missing url must not silently default");
}

/// E a que NOMEIA qual URL faltou.
///
/// `is_err()` sozinho passaria com um `BuildError` genérico, e o chamador ficaria procurando qual
/// dos três setters esquecer. Com três superfícies — duas delas do MESMO serviço — o nome no erro
/// deixou de ser conforto e virou a única forma de saber o que setar.
#[test]
fn missing_url_names_the_surface() {
    // `match` e não `expect_err`: este último exige `Debug` no lado `Ok`, e o `Client` agregado não
    // o deriva (os sub-clientes do progenitor também não). Casar o Result direto não pede nada.
    let built = Client::builder()
        .typescript("http://localhost:3030")
        .go("http://localhost:3032")
        .build();

    match built {
        Err(BuildError::MissingUrl(surface)) => assert_eq!(surface, "typescript-cloud"),
        Ok(_) => panic!("build() aceitou uma superfície sem URL — o erro deixou de ser alto"),
    }
}

/// Enum dedup (rust-wire spec §F4): a contract enum used by an api surface resolves to
/// the WIRE crate's type — one definition, shared by binding and client. This line only
/// compiles if the replacement actually happened (type identity, not name equality).
#[test]
fn contract_enums_are_the_wire_crate_types() {
    let _: codm_contracts_rust::wire::enums::ChannelKind =
        codm_contracts_rust::wire::enums::ChannelKind::WHATSAPP;
}
