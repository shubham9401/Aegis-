// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentIdentityRegistry} from "./interfaces/IAgentIdentityRegistry.sol";

/// @title Aegis permissions and token payment vault
/// @notice Hackathon MVP: bounded delegation, live ancestor checks and atomic spending.
/// @dev No upgrade/admin key. Data decryption still requires a trusted off-chain gateway.
///      The agent's ERC-8004 owner is snapshotted, and must still own the identity at use.
///      Scope identifiers MUST be opaque random values, never personal information.
contract AegisPermissions is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant READ_DIETARY = 1;
    uint256 public constant READ_DESTINATION = 2;
    uint256 public constant READ_ITINERARY = 4;
    uint256 public constant PAY = 8;
    uint256 public constant ALL_ACTIONS = 15;
    uint8 public constant MAX_DEPTH = 4;

    enum Status { Allowed, NotFound, Revoked, Expired, IdentityChanged, WrongAgent,
        InvalidAction, ActionNotAllowed, WrongScope, WrongRecipient, BudgetExceeded,
        InsufficientBalance, InvalidAmount }

    struct Permission {
        address user;
        address issuer;
        address agent;
        address paymentRecipient;
        uint256 agentId;
        uint256 parentId;
        uint256 rootId;
        bytes32 scope;
        uint256 actions;
        uint256 spendingLimit;
        uint256 spent;
        uint256 approvedSpent;
        uint64 expiresAt;
        uint8 depth;
        bool canDelegate;
        bool revoked;
    }

    struct GrantParams {
        uint256 agentId;
        bytes32 scope;
        uint256 actions;
        uint256 spendingLimit;
        uint64 expiresAt;
        bool canDelegate;
        address paymentRecipient;
    }

    struct PaymentApproval {
        uint256 permissionId;
        address recipient;
        uint256 amount;
        uint64 deadline;
    }

    IAgentIdentityRegistry public immutable identityRegistry;
    IERC20 public immutable paymentToken;
    uint256 public nextPermissionId = 1;
    mapping(uint256 => Permission) private _permissions;
    mapping(address => uint256) public balances;
    mapping(bytes32 => bool) public usedRequests;
    mapping(bytes32 => PaymentApproval) public paymentApprovals;

    error InvalidConfiguration();
    error InvalidGrant();
    error UnregisteredAgent(uint256 agentId);
    error PermissionDenied(Status reason);
    error Unauthorized();
    error DelegationNotAllowed();
    error ScopeExpansion();
    error DepthExceeded();
    error InvalidRequestId();
    error RequestAlreadyUsed();
    error UnsupportedToken();

    event PermissionGranted(uint256 indexed permissionId, address indexed user,
        uint256 indexed parentId, uint256 agentId, address agent, bytes32 scope,
        uint256 actions, uint256 spendingLimit, uint64 expiresAt, bool canDelegate,
        address paymentRecipient);
    event PermissionRevoked(uint256 indexed permissionId, address indexed revokedBy);
    /// @dev For data reads this records authorization use, not proof of data delivery.
    event PermissionUsed(uint256 indexed permissionId, uint256 indexed rootId,
        bytes32 indexed requestId, uint256 action, address agent, uint256 amount,
        address recipient, bool manuallyApproved);
    event PaymentApproved(uint256 indexed permissionId, bytes32 indexed requestId,
        address indexed user, address recipient, uint256 amount, uint64 deadline);
    event PaymentApprovalCancelled(uint256 indexed permissionId, bytes32 indexed requestId);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, address indexed recipient, uint256 amount);

    constructor(address registry, address token) {
        if (registry.code.length == 0 || token.code.length == 0) revert InvalidConfiguration();
        identityRegistry = IAgentIdentityRegistry(registry);
        paymentToken = IERC20(token);
    }

    function grantPermission(GrantParams calldata params) external returns (uint256 id) {
        _validateGrant(params.scope, params.actions, params.spendingLimit,
            params.expiresAt, params.paymentRecipient);
        address agent = _registeredOwner(params.agentId);
        id = nextPermissionId++;
        Permission storage p = _permissions[id];
        p.user = msg.sender;
        p.issuer = msg.sender;
        p.agent = agent;
        p.agentId = params.agentId;
        p.rootId = id;
        p.scope = params.scope;
        p.actions = params.actions;
        p.spendingLimit = params.spendingLimit;
        p.expiresAt = params.expiresAt;
        p.canDelegate = params.canDelegate;
        p.paymentRecipient = params.paymentRecipient;
        _emitGrant(id);
    }

    /// @notice Child limits are ceilings, not reservations. Every spend charges ancestors.
    function delegatePermission(uint256 parentId, uint256 agentId, uint256 actions,
        uint256 spendingLimit, uint64 expiresAt, bool canDelegate) external returns (uint256 id)
    {
        Permission storage parent = _permissions[parentId];
        _requireAllowed(_chainStatus(parentId));
        if (msg.sender != parent.agent) revert Unauthorized();
        if (!parent.canDelegate) revert DelegationNotAllowed();
        if (parent.depth >= MAX_DEPTH) revert DepthExceeded();
        if ((actions & ~parent.actions) != 0 || expiresAt > parent.expiresAt
            || spendingLimit > parent.spendingLimit - parent.spent) revert ScopeExpansion();
        address recipient = (actions & PAY) != 0 ? parent.paymentRecipient : address(0);
        _validateGrant(parent.scope, actions, spendingLimit, expiresAt, recipient);
        address agent = _registeredOwner(agentId);
        id = nextPermissionId++;
        Permission storage p = _permissions[id];
        p.user = parent.user;
        p.issuer = msg.sender;
        p.agent = agent;
        p.agentId = agentId;
        p.parentId = parentId;
        p.rootId = parent.rootId;
        p.scope = parent.scope;
        p.actions = actions;
        p.spendingLimit = spendingLimit;
        p.expiresAt = expiresAt;
        p.depth = parent.depth + 1;
        p.canDelegate = canDelegate;
        p.paymentRecipient = recipient;
        _emitGrant(id);
    }

    /// @notice Descendants fail their next check; no unbounded traversal or deletion.
    function revokePermission(uint256 id) external {
        Permission storage p = _permissions[id];
        if (p.user == address(0)) revert PermissionDenied(Status.NotFound);
        if (msg.sender != p.user && msg.sender != p.issuer) revert Unauthorized();
        if (p.revoked) revert PermissionDenied(Status.Revoked);
        p.revoked = true;
        emit PermissionRevoked(id, msg.sender);
    }

    function getPermission(uint256 id) external view returns (Permission memory) {
        return _permissions[id];
    }

    function permissionStatus(uint256 id) external view returns (Status) {
        return _chainStatus(id);
    }

    /// @notice Read-only preflight. `actor` must be authenticated separately by the gateway.
    /// @dev Not a receipt, reservation or permission to decrypt indefinitely.
    function checkPermission(uint256 id, address actor, uint256 action, bytes32 scope)
        public view returns (Status)
    {
        Status status = _chainStatus(id);
        if (status != Status.Allowed) return status;
        Permission storage p = _permissions[id];
        if (actor != p.agent) return Status.WrongAgent;
        if (action == 0 || (action & (action - 1)) != 0 || (action & ~ALL_ACTIONS) != 0)
            return Status.InvalidAction;
        if ((p.actions & action) == 0) return Status.ActionNotAllowed;
        if (scope != p.scope) return Status.WrongScope;
        return Status.Allowed;
    }

    /// @notice Stateful authorization-use receipt for a data action. Never releases data/keys.
    function usePermission(uint256 id, uint256 action, bytes32 scope, bytes32 requestId) external {
        if (action == PAY) revert PermissionDenied(Status.InvalidAction);
        _requireAllowed(checkPermission(id, msg.sender, action, scope));
        _consumeRequest(_permissions[id].rootId, requestId);
        emit PermissionUsed(id, _permissions[id].rootId, requestId, action,
            msg.sender, 0, address(0), false);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert PermissionDenied(Status.InvalidAmount);
        uint256 beforeBalance = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        if (paymentToken.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount, address recipient) external nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        if (amount == 0) revert PermissionDenied(Status.InvalidAmount);
        if (amount > balances[msg.sender]) revert PermissionDenied(Status.InsufficientBalance);
        balances[msg.sender] -= amount;
        paymentToken.safeTransfer(recipient, amount);
        emit Withdrawn(msg.sender, recipient, amount);
    }

    /// @notice Extra, one-use payment consent. Does not increase the automatic spending cap.
    /// @dev The frontend must clearly display amount, token, recipient, agent and expiry.
    ///      A passkey account may submit this; this contract itself does not verify WebAuthn.
    function approvePayment(uint256 id, bytes32 requestId, address recipient,
        uint256 amount, uint64 deadline) external
    {
        Permission storage p = _permissions[id];
        _requireAllowed(_paymentBaseStatus(id, p.agent, recipient, amount));
        if (msg.sender != p.user) revert Unauthorized();
        if (deadline <= block.timestamp || deadline > p.expiresAt) revert InvalidGrant();
        bytes32 key = requestKey(p.rootId, requestId);
        _requireUnused(key, requestId);
        paymentApprovals[key] = PaymentApproval(id, recipient, amount, deadline);
        emit PaymentApproved(id, requestId, msg.sender, recipient, amount, deadline);
    }

    function cancelPaymentApproval(uint256 id, bytes32 requestId) external {
        Permission storage p = _permissions[id];
        if (msg.sender != p.user) revert Unauthorized();
        bytes32 key = requestKey(p.rootId, requestId);
        if (paymentApprovals[key].permissionId != id) revert InvalidRequestId();
        delete paymentApprovals[key];
        emit PaymentApprovalCancelled(id, requestId);
    }

    /// @notice Preflight for automatic spending; pay() also accepts an exact manual approval.
    function checkPayment(uint256 id, address actor, address recipient, uint256 amount)
        public view returns (Status)
    {
        Status status = _paymentBaseStatus(id, actor, recipient, amount);
        if (status != Status.Allowed) return status;
        uint256 cursor = id;
        while (cursor != 0) {
            Permission storage p = _permissions[cursor];
            if (amount > p.spendingLimit - p.spent) return Status.BudgetExceeded;
            cursor = p.parentId;
        }
        if (amount > balances[_permissions[id].user]) return Status.InsufficientBalance;
        return Status.Allowed;
    }

    /// @notice Checks permission, consumes budget and transfers tokens in one transaction.
    /// @dev No arbitrary call/delegatecall/approval escape hatch. All payments use this vault.
    function pay(uint256 id, address recipient, uint256 amount, bytes32 requestId)
        external nonReentrant
    {
        Permission storage leaf = _permissions[id];
        _requireAllowed(_paymentBaseStatus(id, msg.sender, recipient, amount));
        bytes32 key = requestKey(leaf.rootId, requestId);
        _requireUnused(key, requestId);
        PaymentApproval memory approval = paymentApprovals[key];
        bool manual = approval.permissionId == id && approval.recipient == recipient
            && approval.amount == amount && approval.deadline > block.timestamp;
        // An existing approval reserves this request ID for exactly its approved payload.
        if (approval.permissionId != 0 && !manual) revert InvalidRequestId();
        if (!manual) _requireAllowed(checkPayment(id, msg.sender, recipient, amount));
        if (amount > balances[leaf.user]) revert PermissionDenied(Status.InsufficientBalance);
        usedRequests[key] = true;
        delete paymentApprovals[key];
        uint256 cursor = id;
        while (cursor != 0) {
            Permission storage p = _permissions[cursor];
            if (manual) p.approvedSpent += amount;
            else p.spent += amount;
            cursor = p.parentId;
        }
        balances[leaf.user] -= amount;
        paymentToken.safeTransfer(recipient, amount);
        emit PermissionUsed(id, leaf.rootId, requestId, PAY, msg.sender, amount, recipient, manual);
    }

    function requestKey(uint256 rootId, bytes32 requestId) public pure returns (bytes32) {
        return keccak256(abi.encode(rootId, requestId));
    }

    function _paymentBaseStatus(uint256 id, address actor, address recipient, uint256 amount)
        private view returns (Status)
    {
        Permission storage p = _permissions[id];
        Status status = checkPermission(id, actor, PAY, p.scope);
        if (status != Status.Allowed) return status;
        if (amount == 0) return Status.InvalidAmount;
        if (recipient == address(0) || recipient != p.paymentRecipient) return Status.WrongRecipient;
        return Status.Allowed;
    }

    function _chainStatus(uint256 id) private view returns (Status) {
        if (_permissions[id].user == address(0)) return Status.NotFound;
        uint256 cursor = id;
        while (cursor != 0) {
            Permission storage p = _permissions[cursor];
            if (p.revoked) return Status.Revoked;
            if (block.timestamp >= p.expiresAt) return Status.Expired;
            try identityRegistry.ownerOf(p.agentId) returns (address currentOwner) {
                if (currentOwner != p.agent) return Status.IdentityChanged;
            } catch { return Status.IdentityChanged; }
            cursor = p.parentId;
        }
        return Status.Allowed;
    }

    function _registeredOwner(uint256 agentId) private view returns (address agent) {
        try identityRegistry.ownerOf(agentId) returns (address currentOwner) { agent = currentOwner; }
        catch { revert UnregisteredAgent(agentId); }
        if (agent == address(0)) revert UnregisteredAgent(agentId);
    }

    function _validateGrant(bytes32 scope, uint256 actions, uint256 spendingLimit,
        uint64 expiresAt, address recipient) private view
    {
        if (scope == bytes32(0) || actions == 0 || (actions & ~ALL_ACTIONS) != 0
            || expiresAt <= block.timestamp) revert InvalidGrant();
        if ((actions & PAY) != 0) {
            if (recipient == address(0) || recipient == address(this)) revert InvalidGrant();
        } else if (spendingLimit != 0 || recipient != address(0)) revert InvalidGrant();
    }

    function _requireAllowed(Status status) private pure {
        if (status != Status.Allowed) revert PermissionDenied(status);
    }

    function _requireUnused(bytes32 key, bytes32 requestId) private view {
        if (requestId == bytes32(0)) revert InvalidRequestId();
        if (usedRequests[key]) revert RequestAlreadyUsed();
    }

    function _consumeRequest(uint256 rootId, bytes32 requestId) private {
        bytes32 key = requestKey(rootId, requestId);
        _requireUnused(key, requestId);
        usedRequests[key] = true;
    }

    function _emitGrant(uint256 id) private {
        Permission storage p = _permissions[id];
        emit PermissionGranted(id, p.user, p.parentId, p.agentId, p.agent, p.scope,
            p.actions, p.spendingLimit, p.expiresAt, p.canDelegate, p.paymentRecipient);
    }
}
