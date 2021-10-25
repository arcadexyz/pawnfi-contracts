# `FeeController`

The FeeController is intended to be an upgradable component of the Pawn
protocol where new fees can be added or modified based on different
platform needs.

Fees may be assessed based on the following attributes:
- Type/size of loan being requested
- Amount of tokens being staked, etc
- Due dates/penalty payments

## API

### `setOriginationFee(uint256 _originationFee)` (external)

Set the origination fee to the given value. Can only be called by contract owner.

Emits `UpdateOriginationFee`.

### `getOriginationFee() → uint256` (public)

Get the current origination fee in bps.

## Events

### `UpdateOriginationFee(uint256 _newFee)`

Emitted when the origination fee is changed. All fees are expressed in bps.