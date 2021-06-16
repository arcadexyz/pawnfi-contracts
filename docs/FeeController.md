## `FeeController`

Fee Controller is intended to be an upgradable component of Pawnfi
where new fees can be added or modified based on different user attributes

Type/size of loan being requested
Amount of tokens being staked, etc

Version 1 (as of 4/21/2021) Capabilities:

FeeController will be called once after a loan has been matched so that we can
create an origination fee (2% credited to PawnFi)

support for floating point originationFee should be discussed

### `setOriginationFee(uint256 _originationFee)` (external)

Set the origination fee to the given value

### `getOriginationFee() → uint256` (public)

Get the current origination fee in bps
