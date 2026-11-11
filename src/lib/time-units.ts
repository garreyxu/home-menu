/** Shared English duration units; longer words such as "minced" must not match. */
export const HOUR_UNIT = String.raw`(?:hours?|hrs?)(?![a-z])`;
export const MINUTE_UNIT = String.raw`(?:minutes?|mins?)(?![a-z])`;
