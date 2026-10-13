# Integrated demo contract

The user authorized completing all teammates' remaining integration work. This document records the shared interface rather than inventing a second contract model.

- Use the existing deployed Aegis contract and generated ABI; do not change Solidity merely to fit the old local policy adapter.
- Contract mode uses numeric permission and ERC-8004 IDs. Fields use the documented action bits and an opaque bytes32 resource scope, bound to the resource owner by the gateway.
- Payments use aUSD-TEST, six decimals, and one explicit recipient address per grant. The merchant is a demo recipient, not an airline reservation API.
- The allowance is cumulative automatic spending. approvePayment authorizes an exact additional payment; it does not increase/reset that allowance. Show automatic spent and extra spent separately.
- Browser owner writes require a fresh Mera passkey ceremony. The server has no user signing key. The agent signs pay/delegate from its encrypted local keystore.
- Signed data and payment requests are authenticated against the actual grant and live ERC-8004 ownership. Decryption stays behind a live check; previously delivered data cannot be recalled.
- The initial hosting target is one Node 24 process with a private persistent directory. Encrypted queues and replay tracking rely on this constraint. Serverless/replicas require transactional storage.
- Optional Envio and user-held vault keys are separate extensions; the initial vault is AES-GCM with a trusted server-held key.
