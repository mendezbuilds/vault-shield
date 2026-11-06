use near_sdk::near;

#[near(contract_state)]
#[derive(Default)]
pub struct ToolchainProof {
    message: String,
}

#[near]
impl ToolchainProof {
    #[init]
    pub fn new(message: String) -> Self {
        Self { message }
    }

    pub fn get_message(&self) -> String {
        self.message.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialization_and_read() {
        let contract = ToolchainProof::new("toolchain_ok".to_string());
        assert_eq!(contract.get_message(), "toolchain_ok");
    }
}

