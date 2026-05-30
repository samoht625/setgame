# Card Mapping Reference

This document explains how card IDs (1-81) map to Set game attributes and to the
images in `public/cards/`.

## Mapping Algorithm

Card IDs are mapped to attributes using base-3 arithmetic (least significant digit first):

```ruby
card_id = 1..81
base3 = (card_id - 1).digits(3)
# base3[0] = number  (0, 1, or 2)
# base3[1] = color   (0, 1, or 2)
# base3[2] = shape   (0, 1, or 2)
# base3[3] = shading (0, 1, or 2)
```

The same mapping is implemented in `app/services/rules.rb` (server) and
`app/javascript/lib/rules.ts` (client).

## Attribute Values

- **Number**: 0 = 1 shape, 1 = 2 shapes, 2 = 3 shapes
- **Color**: 0 = red, 1 = purple, 2 = green
- **Shape**: 0 = squiggle, 1 = diamond, 2 = oval
- **Shading**: 0 = solid, 1 = striped, 2 = open

## Example Mappings

| Card ID | Number | Color | Shape | Shading | Description |
|---------|--------|-------|-------|---------|-------------|
| 1 | 0 (1) | 0 (red) | 0 (squiggle) | 0 (solid) | 1 solid red squiggle |
| 2 | 1 (2) | 0 (red) | 0 (squiggle) | 0 (solid) | 2 solid red squiggles |
| 3 | 2 (3) | 0 (red) | 0 (squiggle) | 0 (solid) | 3 solid red squiggles |
| 4 | 0 (1) | 1 (purple) | 0 (squiggle) | 0 (solid) | 1 solid purple squiggle |
| 10 | 0 (1) | 0 (red) | 1 (diamond) | 0 (solid) | 1 solid red diamond |
| 28 | 0 (1) | 0 (red) | 0 (squiggle) | 1 (striped) | 1 striped red squiggle |
| 81 | 2 (3) | 2 (green) | 2 (oval) | 2 (open) | 3 open green ovals |

## Valid Sets

A valid set consists of three distinct cards where, for each attribute:
- All three cards have the same value, OR
- All three cards have different values

Note that set validity only depends on the per-digit comparison, so it is
independent of which attribute each digit is labelled as.

### Example Valid Sets

**Set 1**: Cards 1, 2, 3
- Number: 0, 1, 2 (all different) ✓
- Color: 0, 0, 0 (all same) ✓
- Shape: 0, 0, 0 (all same) ✓
- Shading: 0, 0, 0 (all same) ✓

**Set 2**: Cards 1, 4, 7
- Number: 0, 0, 0 (all same) ✓
- Color: 0, 1, 2 (all different) ✓
- Shape: 0, 0, 0 (all same) ✓
- Shading: 0, 0, 0 (all same) ✓

## Testing

Run `ruby script/test_rules.rb` to verify the mapping and validation logic.
