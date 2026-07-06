# frozen_string_literal: true

# Mulberry32 PRNG with integer-only Fisher–Yates.
# Must stay bit-identical to app/javascript/lib/seeded_shuffle.ts
class SoloRng
  MASK = 0xFFFFFFFF

  def initialize(seed)
    @state = seed_to_u32(seed)
  end

  def self.from_state(state)
    rng = allocate
    rng.instance_variable_set(:@state, state.to_i & MASK)
    rng
  end

  def state
    @state & MASK
  end

  # Returns next uint32 in [0, 2^32)
  def next_u32
    # Match TS mulberry32:
    #   let t = (this.state = (this.state + 0x6d2b79f5) | 0)
    #   t = Math.imul(t ^ (t >>> 15), t | 1)
    #   t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    #   return (t ^ (t >>> 14)) >>> 0
    @state = to_int32(@state + 0x6d2b79f5) & MASK
    t = to_int32(@state)
    t = imul_signed(t ^ ushr(t, 15), t | 1)
    t = to_int32(t ^ to_int32(t + imul_signed(t ^ ushr(t, 7), t | 61)))
    ushr(t ^ ushr(t, 14), 0)
  end

  def next_index(n)
    raise ArgumentError, "n must be positive" if n <= 0

    next_u32 % n
  end

  def shuffle!(array)
    i = array.length - 1
    while i > 0
      j = next_index(i + 1)
      array[i], array[j] = array[j], array[i]
      i -= 1
    end
    array
  end

  def shuffle(array)
    shuffle!(array.dup)
  end

  private

  def seed_to_u32(seed)
    case seed
    when Integer
      seed & MASK
    else
      h = 0x811c9dc5
      seed.to_s.each_byte do |b|
        h = imul_signed(h ^ b, 0x01000193) & MASK
      end
      h & MASK
    end
  end

  def imul(a, b)
    imul_signed(a, b) & MASK
  end

  def imul_signed(a, b)
    to_int32((to_int32(a) * to_int32(b)) & MASK)
  end

  def to_int32(n)
    n = n & MASK
    n >= 0x80000000 ? n - 0x100000000 : n
  end

  def to_int(n)
    to_int32(n)
  end

  def ushr(value, bits)
    (value & MASK) >> (bits & 31)
  end
end
