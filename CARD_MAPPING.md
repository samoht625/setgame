# Card Mapping Reference

This document explains how card IDs (1-81) map to Set game attributes.

## Mapping Algorithm

Card IDs are mapped to attributes using base-3 arithmetic:

```ruby
card_id = 1..81
base3 = (card_id - 1).digits(3)
# base3[0] = number (0, 1, or 2)
# base3[1] = shape (0, 1, or 2)
# base3[2] = shading (0, 1, or 2)
# base3[3] = color (0, 1, or 2)
```

## Attribute Values

- **Number**: 0 = 1 shape, 1 = 2 shapes, 2 = 3 shapes
- **Shape**: 0 = diamond, 1 = squiggle, 2 = oval
- **Shading**: 0 = solid, 1 = striped, 2 = open
- **Color**: 0 = red, 1 = green, 2 = purple

## Example Mappings

| Card ID | Number | Shape | Shading | Color | Description |
|---------|--------|-------|---------|-------|-------------|
| 1 | 0 (1) | 0 (diamond) | 0 (solid) | 0 (red) | 1 solid red diamond |
| 2 | 1 (2) | 0 (diamond) | 0 (solid) | 0 (red) | 2 solid red diamonds |
| 3 | 2 (3) | 0 (diamond) | 0 (solid) | 0 (red) | 3 solid red diamonds |
| 28 | 0 (1) | 0 (diamond) | 0 (solid) | 1 (green) | 1 solid green diamond |
| 55 | 0 (1) | 0 (diamond) | 0 (solid) | 2 (purple) | 1 solid purple diamond |

## Valid Sets

A valid set consists of three cards where, for each attribute:
- All three cards have the same value, OR
- All three cards have different values

### Example Valid Sets

**Set 1**: Cards 1, 2, 3
- Number: 0, 1, 2 (all different) ✓
- Shape: 0, 0, 0 (all same) ✓
- Shading: 0, 0, 0 (all same) ✓
- Color: 0, 0, 0 (all same) ✓

**Set 2**: Cards 1, 28, 55
- Number: 0, 0, 0 (all same) ✓
- Shape: 0, 0, 0 (all same) ✓
- Shading: 0, 0, 0 (all same) ✓
- Color: 0, 1, 2 (all different) ✓

## Testing

Run `ruby test_rules.rb` to verify the mapping and validation logic.

