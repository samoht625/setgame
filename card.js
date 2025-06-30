export var CardNumber;
(function (CardNumber) {
    CardNumber["ONE"] = "ONE";
    CardNumber["TWO"] = "TWO";
    CardNumber["THREE"] = "THREE";
})(CardNumber || (CardNumber = {}));
export var CardShape;
(function (CardShape) {
    CardShape["DIAMOND"] = "DIAMOND";
    CardShape["SQUIGGLE"] = "SQUIGGLE";
    CardShape["OVAL"] = "OVAL";
})(CardShape || (CardShape = {}));
export var CardShading;
(function (CardShading) {
    CardShading["SOLID"] = "SOLID";
    CardShading["STRIPED"] = "STRIPED";
    CardShading["OPEN"] = "OPEN";
})(CardShading || (CardShading = {}));
export var CardColor;
(function (CardColor) {
    CardColor["RED"] = "RED";
    CardColor["GREEN"] = "GREEN";
    CardColor["PURPLE"] = "PURPLE";
})(CardColor || (CardColor = {}));
export class Card {
    constructor(number, shape, shading, color, id) {
        this.number = number;
        this.shape = shape;
        this.shading = shading;
        this.color = color;
        this.id = id;
    }
    getNumber() { return this.number; }
    getShape() { return this.shape; }
    getShading() { return this.shading; }
    getColor() { return this.color; }
    getId() { return this.id; }
    equals(other) {
        return this.id === other.id;
    }
    toString() {
        return `Card{${this.number} ${this.shading} ${this.color} ${this.shape}}`;
    }
}
