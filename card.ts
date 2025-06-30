export enum CardNumber {
    ONE = 'ONE',
    TWO = 'TWO',
    THREE = 'THREE'
}

export enum CardShape {
    DIAMOND = 'DIAMOND',
    SQUIGGLE = 'SQUIGGLE',
    OVAL = 'OVAL'
}

export enum CardShading {
    SOLID = 'SOLID',
    STRIPED = 'STRIPED',
    OPEN = 'OPEN'
}

export enum CardColor {
    RED = 'RED',
    GREEN = 'GREEN',
    PURPLE = 'PURPLE'
}

export class Card {
    private readonly number: CardNumber;
    private readonly shape: CardShape;
    private readonly shading: CardShading;
    private readonly color: CardColor;
    private readonly id: number;

    constructor(number: CardNumber, shape: CardShape, shading: CardShading, color: CardColor, id: number) {
        this.number = number;
        this.shape = shape;
        this.shading = shading;
        this.color = color;
        this.id = id;
    }

    getNumber(): CardNumber { return this.number; }
    getShape(): CardShape { return this.shape; }
    getShading(): CardShading { return this.shading; }
    getColor(): CardColor { return this.color; }
    getId(): number { return this.id; }

    equals(other: Card): boolean {
        return this.id === other.id;
    }

    toString(): string {
        return `Card{${this.number} ${this.shading} ${this.color} ${this.shape}}`;
    }
} 