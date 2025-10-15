import { Card, CardNumber, CardShape, CardShading, CardColor } from './card.js';

export class GameLogic {
    private deck: Card[];
    private displayedCards: Card[];
    private selectedCards: Set<Card>;
    private setsFound: number;

    constructor() {
        this.deck = [];
        this.displayedCards = [];
        this.selectedCards = new Set<Card>();
        this.setsFound = 0;
        this.initializeDeck();
        this.shuffleDeck();
    }

    private initializeDeck(): void {
        let id = 1;
        for (const number of Object.values(CardNumber)) {
            for (const shape of Object.values(CardShape)) {
                for (const shading of Object.values(CardShading)) {
                    for (const color of Object.values(CardColor)) {
                        this.deck.push(new Card(number, shape, shading, color, id++));
                    }
                }
            }
        }
    }

    private shuffleDeck(): void {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    startNewGame(): void {
        this.deck = [];
        this.initializeDeck();
        this.shuffleDeck();
        this.displayedCards = [];
        this.selectedCards.clear();
        this.setsFound = 0;
        this.dealInitialCards();
    }

    private dealInitialCards(): void {
        // Deal 12 cards initially
        for (let i = 0; i < 12 && this.deck.length > 0; i++) {
            this.displayedCards.push(this.deck.pop()!);
        }
    }

    selectCard(card: Card): 'deselected' | 'selected' | 'valid-set' | 'invalid-set' {
        if (this.selectedCards.has(card)) {
            this.selectedCards.delete(card);
            return 'deselected';
        } else {
            this.selectedCards.add(card);
            if (this.selectedCards.size === 3) {
                return this.checkForSet();
            }
            return 'selected';
        }
    }

    private checkForSet(): 'valid-set' | 'invalid-set' {
        if (this.selectedCards.size !== 3) return 'invalid-set';
        
        const cards = Array.from(this.selectedCards);
        if (GameLogic.isValidSet(cards[0], cards[1], cards[2])) {
            this.setsFound++;
            this.replaceSelectedCardsInPlace();
            this.selectedCards.clear();
            return 'valid-set';
        } else {
            // Don't clear selection here - let UI handle the timing
            return 'invalid-set';
        }
    }

    private replaceSelectedCardsInPlace(): void {
        const indices: number[] = [];
        for (const card of this.selectedCards) {
            const idx = this.displayedCards.findIndex(c => c.equals(card));
            if (idx !== -1) indices.push(idx);
        }
        
        // Sort in descending order to avoid index issues when removing
        indices.sort((a, b) => b - a);
        
        if (this.displayedCards.length > 12) {
            // Just remove the selected cards
            for (const idx of indices) {
                this.displayedCards.splice(idx, 1);
            }
        } else {
            // Replace in-place if possible, otherwise remove
            for (const idx of indices) {
                if (this.deck.length > 0) {
                    this.displayedCards[idx] = this.deck.pop()!;
                } else {
                    this.displayedCards.splice(idx, 1);
                }
            }
        }
    }

    static isValidSet(card1: Card, card2: Card, card3: Card): boolean {
        return this.isValidFeature(card1.getNumber(), card2.getNumber(), card3.getNumber()) &&
               this.isValidFeature(card1.getShape(), card2.getShape(), card3.getShape()) &&
               this.isValidFeature(card1.getShading(), card2.getShading(), card3.getShading()) &&
               this.isValidFeature(card1.getColor(), card2.getColor(), card3.getColor());
    }

    private static isValidFeature<T>(feature1: T, feature2: T, feature3: T): boolean {
        // All same or all different
        return (feature1 === feature2 && feature2 === feature3) ||
               (feature1 !== feature2 && feature2 !== feature3 && feature1 !== feature3);
    }

    dealMoreCards(): void {
        // Deal 3 more cards when no set is visible
        for (let i = 0; i < 3 && this.deck.length > 0; i++) {
            this.displayedCards.push(this.deck.pop()!);
        }
    }

    hasVisibleSet(): boolean {
        const cards = this.displayedCards;
        for (let i = 0; i < cards.length - 2; i++) {
            for (let j = i + 1; j < cards.length - 1; j++) {
                for (let k = j + 1; k < cards.length; k++) {
                    if (GameLogic.isValidSet(cards[i], cards[j], cards[k])) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    isGameOver(): boolean {
        return this.deck.length === 0 && !this.hasVisibleSet();
    }

    getDisplayedCards(): Card[] {
        return [...this.displayedCards];
    }

    getSelectedCards(): Set<Card> {
        return new Set(this.selectedCards);
    }

    getSetsFound(): number {
        return this.setsFound;
    }

    getRemainingCards(): number {
        return this.deck.length;
    }

    clearSelection(): void {
        this.selectedCards.clear();
    }
} 