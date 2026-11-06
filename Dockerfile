# Pinned verified toolchain environment
# Rust 1.99.1 (pinned by version and sha256 digest)
FROM rust:1.99.1@sha256:bc2c4c21d4467cdbbac0ee7b95a6deb742a3467dfe0ff7647916c4b42ca56372
RUN rustup target add wasm32-unknown-unknown
WORKDIR /workspace

