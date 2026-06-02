import "server-only";

/**
 * A representative set of the most common / breached passwords. This is a
 * curated subset (the realistic offenders) rather than the full 10k list, to
 * keep the server bundle small and dependency-free; it catches the passwords
 * real users actually pick. Compared case-insensitively after trimming.
 */
const COMMON_PASSWORDS = new Set<string>([
  "123456", "123456789", "12345678", "1234567890", "1234567", "12345",
  "111111", "000000", "121212", "112233", "123123", "654321", "666666",
  "password", "password1", "password123", "passw0rd", "pass1234", "passpass",
  "qwerty", "qwerty123", "qwertyuiop", "qwerty1", "1q2w3e4r", "1qaz2wsx",
  "asdfghjkl", "zxcvbnm", "abc123", "abcd1234", "a1b2c3d4",
  "iloveyou", "admin", "administrator", "welcome", "welcome1", "login",
  "letmein", "monkey", "dragon", "sunshine", "princess", "football",
  "baseball", "superman", "batman", "trustno1", "master", "shadow",
  "michael", "jennifer", "michelle", "computer", "internet", "samsung",
  "google", "starwars", "whatever", "freedom", "ninja", "azerty",
  "11111111", "00000000", "1234", "12341234", "changeme", "secret",
  "test", "test123", "temp123", "default", "root", "toor", "guest",
  "money", "love", "hello", "hello123", "summer", "winter", "spring",
  "autumn", "soccer", "hockey", "killer", "hunter", "mustang", "harley",
  "ranger", "buster", "george", "tigger", "charlie", "robert", "thomas",
  "qwe123", "121212", "asdf1234", "zaq12wsx", "p@ssword", "p@ssw0rd",
  "iloveyou1", "mypassword", "newpassword", "oriapassword", "heyoria",
]);

/** True when the password is on the common/breached list (case-insensitive). */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

/** Minimum password length enforced at signup. */
export const MIN_PASSWORD_LENGTH = 12;
