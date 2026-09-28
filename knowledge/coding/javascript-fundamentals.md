# JavaScript Fundamentals - Values, Types, and Operators

This reference covers the foundational JavaScript concepts for values, types, and operators based on Eloquent JavaScript Chapter 1.

## Value Types

### Numbers
- **Storage**: 64-bit representation (can represent ~9 quadrillion whole numbers precisely)
- **Integers**: Guaranteed precision for calculations with whole numbers < 9 quadrillion
- **Fractional numbers**: Written with a dot (e.g., `9.81`)
- **Scientific notation**: Use `e` for exponent (e.g., `2.998e8` = 2.998 × 10⁸ = 299,800,000)
- **Precision note**: Fractional numbers are approximations, not precise values (similar to π)

```javascript
13              // Integer
9.81            // Fractional
2.998e8         // Scientific notation
```

### Special Numbers
- `Infinity` - Positive infinity
- `-Infinity` - Negative infinity
- `NaN` - "Not a Number" (result of nonsensical operations like `0/0` or `Infinity - Infinity`)

**Important**: `NaN` is the only value not equal to itself (`NaN == NaN` is `false`)

### Strings
- **Purpose**: Represent text
- **Quote styles**: Single quotes (`'`), double quotes (`"`), or backticks (`` ` ``)
- **Escaping**: Use backslash `\` for special characters
  - `\"` - Include quote in string
  - `\n` - Newline
  - `\t` - Tab
  - `\\` - Literal backslash

```javascript
'Down on the sea'
"Lie on the ocean"
`Float on the ocean`
"This is the first line\nAnd this is the second"
"A newline character is written like \"\\n\"."
```

**Template literals** (backticks):
- Can span multiple lines
- Can embed values with `${}`

```javascript
`half of 100 is ${100 / 2}`  // Produces "half of 100 is 50"
```

**Unicode**: JavaScript uses 16 bits per character, but Unicode has more characters than that. Some characters (like emoji) take two positions.

### Booleans
- Only two values: `true` and `false`
- Used for binary distinctions (yes/no, on/off)

### Empty Values
- `null` - Absence of meaningful value
- `undefined` - Absence of meaningful value
- **Note**: Difference is an accident of JavaScript design; treat them as mostly interchangeable

## Operators

### Arithmetic Operators
| Operator | Name | Example | Result |
|----------|------|---------|--------|
| `+` | Addition | `100 + 4` | `104` |
| `-` | Subtraction | `100 - 4` | `96` |
| `*` | Multiplication | `4 * 11` | `44` |
| `/` | Division | `100 / 4` | `25` |
| `%` | Remainder (modulo) | `314 % 100` | `14` |

**Precedence**: `*`, `/`, `%` have higher precedence than `+`, `-`
- Use parentheses to control order: `(100 + 4) * 11` = `1144`

### String Operations
- **Concatenation**: `+` joins strings together
  ```javascript
  "con" + "cat" + "e" + "nate"  // "concatenate"
  ```

### Comparison Operators
| Operator | Name | Example | Result |
|----------|------|---------|--------|
| `>` | Greater than | `3 > 2` | `true` |
| `<` | Less than | `3 < 2` | `false` |
| `>=` | Greater or equal | `3 >= 3` | `true` |
| `<=` | Less or equal | `3 <= 3` | `true` |
| `==` | Loose equality | `"5" == 5` | `true` |
| `===` | Strict equality | `"5" === 5` | `false` |
| `!=` | Loose inequality | `"5" != 5` | `false` |
| `!==` | Strict inequality | `"5" !== 5` | `true` |

**String comparison**: Roughly alphabetic, but uppercase < lowercase
```javascript
"Aardvark" < "Zoroaster"  // true
"Z" < "a"                 // true (uppercase < lowercase)
```

**Best practice**: Use `===` and `!==` to prevent unexpected type conversions

### Logical Operators
| Operator | Name | Behavior |
|----------|------|----------|
| `&&` | AND | `true` only if both sides are `true` |
| `\|\|` | OR | `true` if either side is `true` |
| `!` | NOT | Flips the value (`!true` = `false`) |
| `??` | Nullish coalescing | Returns right only if left is `null`/`undefined` |

**Precedence** (lowest to highest): `||`, `&&`, comparison operators, arithmetic

```javascript
true && false    // false
true && true     // true
false || true    // true
false || false   // false
!true            // false
```

### Unary Operators
- `typeof` - Returns string naming the type
  ```javascript
  typeof 4.5      // "number"
  typeof "x"      // "string"
  ```
- `-` (unary minus) - Negates a number
  ```javascript
  -(10 - 2)       // -8
  ```
- `!` - Logical NOT

### Ternary Operator
- **Conditional operator**: `condition ? valueIfTrue : valueIfFalse`
  ```javascript
  true ? 1 : 2    // 1
  false ? 1 : 2   // 2
  ```

## Type Coercion

JavaScript automatically converts types when operators are applied to "wrong" types:

```javascript
8 * null          // 0 (null becomes 0)
"5" - 1           // 4 (string becomes number)
"5" + 1           // "51" (number becomes string for concatenation)
"five" * 2        // NaN (string can't convert to number)
false == 0        // true (false becomes 0)
```

**Rules**:
- `null` becomes `0` in arithmetic
- Strings that look like numbers become numbers
- `+` tries string concatenation before numeric addition
- Values that can't map to numbers become `NaN`

**Comparison with coercion**:
```javascript
null == undefined   // true
null == 0           // false
0 == false          // true
"" == false         // true
```

**Use `==` vs `===`**:
- `==` with `null`/`undefined` is useful to test for absence of value
- Use `===` and `!==` defensively to prevent unexpected conversions

## Short-Circuit Evaluation

### Logical OR (`||`)
- Returns left value if it converts to `true`, otherwise right value
- Used for fallback/default values
- Right side evaluated only when necessary

```javascript
null || "user"      // "user"
"Agnes" || "user"   // "Agnes"
0 || -1             // -1 (0 is falsy)
"" || "!?"          // "!?" (empty string is falsy)
```

### Nullish Coalescing (`??`)
- Returns right value only if left is `null` or `undefined`
- Prefer over `||` when you want to keep falsy values like `0` or `""`

```javascript
0 || 100            // 100
0 ?? 100            // 0 (keeps the 0)
null ?? 100         // 100
```

### Logical AND (`&&`)
- Returns left value if it converts to `false`, otherwise right value
- Right side evaluated only when necessary

```javascript
false && X          // false (X never evaluated)
true && X           // X (evaluated)
```

## Type Conversion to Boolean

Values that convert to `false`:
- `0`
- `NaN`
- `""` (empty string)
- `null`
- `undefined`
- `false`

All other values convert to `true`.

## Quick Reference Summary

### Create Values
- Numbers: `13`, `9.81`, `2.998e8`
- Strings: `"text"`, `'text'`, `` `text` ``
- Booleans: `true`, `false`
- Empty: `null`, `undefined`

### Common Operations
```javascript
// Arithmetic
100 + 4 * 11              // 144 (multiplication first)
(100 + 4) * 11            // 1144
314 % 100                 // 14

// String concatenation
"con" + "cat"             // "concat"
`half of 100 is ${100/2}` // "half of 100 is 50"

// Comparison
3 > 2                     // true
"Aardvark" < "Zoroaster"  // true
"5" === 5                 // false (strict)

// Logical
true && false             // false
false || true             // true
!true                     // false

// Conditional
true ? 1 : 2               // 1
false ? 1 : 2              // 2

// Type checking
typeof 4.5                // "number"
typeof "x"                // "string"

// Fallback values
null || "default"         // "default"
0 ?? 100                  // 0
```

### Best Practices
1. Use `===` and `!==` for comparisons unless you specifically want type coercion
2. Use `??` instead of `||` when you only want to fallback on `null`/`undefined`
3. Add parentheses when operator precedence is unclear
4. Be aware that fractional numbers are approximations
5. Remember that `NaN` is not equal to itself
