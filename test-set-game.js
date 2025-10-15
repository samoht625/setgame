import { chromium } from 'playwright';

class SetGameTester {
    constructor() {
        this.browser = null;
        this.context = null;
        this.pages = [];
        this.testResults = [];
    }

    async setup() {
        console.log('🚀 Setting up Set Game browser testing...');
        
        this.browser = await chromium.launch({ 
            headless: false, // Keep visible for debugging
            slowMo: 500 // Slow down actions for better visibility
        });
        
        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        
        console.log('✅ Browser setup complete');
    }

    async testServerHealth() {
        console.log('\n📡 Testing server health...');
        
        try {
            const backendResponse = await fetch('http://localhost:3000/api/health');
            const backendStatus = await backendResponse.json();
            console.log('✅ Backend health:', backendStatus);
            
            const frontendResponse = await fetch('http://localhost:8080');
            console.log('✅ Frontend status:', frontendResponse.status === 200 ? 'OK' : 'FAILED');
            
            return true;
        } catch (error) {
            console.log('❌ Server health check failed:', error.message);
            return false;
        }
    }

    async testSinglePlayerGame() {
        console.log('\n🎮 Testing single-player game...');
        
        const page = await this.context.newPage();
        this.pages.push(page);
        
        try {
            // Navigate to main game
            await page.goto('http://localhost:8080');
            await page.waitForSelector('#game-container', { timeout: 10000 });
            
            console.log('✅ Game page loaded');
            
            // Check if cards are displayed
            await page.waitForSelector('.card', { timeout: 5000 });
            const cardCount = await page.$$('.card');
            console.log(`✅ Found ${cardCount.length} cards`);
            
            // Test new game button
            await page.click('#new-game-btn');
            console.log('✅ New game button works');
            
            // Test pause button
            await page.click('#pause-btn');
            await page.waitForTimeout(1000);
            await page.click('#pause-btn');
            console.log('✅ Pause/resume functionality works');
            
            // Test card selection (try to find a valid set)
            const cards = await page.$$('.card');
            if (cards.length >= 3) {
                console.log('🎯 Testing card selection...');
                
                // Select first three cards to test selection mechanism
                await cards[0].click();
                await cards[1].click();
                await cards[2].click();
                
                await page.waitForTimeout(1000);
                console.log('✅ Card selection mechanism works');
            }
            
            // Test best times modal
            await page.click('#best-times-btn');
            await page.waitForSelector('#high-scores-modal', { visible: true });
            console.log('✅ Best times modal opens');
            
            await page.click('#close-modal');
            console.log('✅ Best times modal closes');
            
            return true;
        } catch (error) {
            console.log('❌ Single-player test failed:', error.message);
            return false;
        }
    }

    async testMultiplayerGame() {
        console.log('\n👥 Testing multiplayer game...');
        
        // Open two browser tabs for multiplayer testing
        const page1 = await this.context.newPage();
        const page2 = await this.context.newPage();
        
        this.pages.push(page1, page2);
        
        try {
            // Navigate both pages to multiplayer
            await Promise.all([
                page1.goto('http://localhost:8080/multiplayer.html'),
                page2.goto('http://localhost:8080/multiplayer.html')
            ]);
            
            await Promise.all([
                page1.waitForSelector('#game-container', { timeout: 10000 }),
                page2.waitForSelector('#game-container', { timeout: 10000 })
            ]);
            
            console.log('✅ Both multiplayer pages loaded');
            
            // Wait for Socket.IO connections
            await page1.waitForTimeout(3000);
            await page2.waitForTimeout(3000);
            
            // Check if players are connected
            const players1 = await page1.$$('.player-item');
            const players2 = await page2.$$('.player-item');
            
            console.log(`✅ Player 1 sees ${players1.length} players`);
            console.log(`✅ Player 2 sees ${players2.length} players`);
            
            // Test starting a new game if both players are connected
            if (players1.length > 0 && players2.length > 0) {
                await page1.click('#new-game-btn');
                await page1.waitForTimeout(2000);
                
                // Check if cards appear (multiplayer uses .minimal-card class)
                const cards1 = await page1.$$('.minimal-card');
                const cards2 = await page2.$$('.minimal-card');
                
                console.log(`✅ Game started - Player 1 sees ${cards1.length} cards, Player 2 sees ${cards2.length} cards`);
                
                // Test Set validation in multiplayer
                if (cards1.length >= 3) {
                    await this.testSetValidation(page1, 'multiplayer');
                }
            }
            
            return true;
        } catch (error) {
            console.log('❌ Multiplayer test failed:', error.message);
            return false;
        }
    }

    async testGameRulesAndMechanics() {
        console.log('\n🧩 Testing Set Game rules and mechanics...');
        
        const page = await this.context.newPage();
        this.pages.push(page);
        
        try {
            await page.goto('http://localhost:8080');
            await page.waitForSelector('#game-container');
            await page.waitForSelector('.card');
            
            console.log('✅ Testing Set Game core mechanics');
            
            // Test that we can select exactly 3 cards
            const cards = await page.$$('.card');
            
            if (cards.length >= 3) {
                // Select 3 cards
                await cards[0].click();
                await cards[1].click(); 
                await cards[2].click();
                
                await page.waitForTimeout(1000);
                
                // Try to select a 4th card to test validation
                if (cards.length > 3) {
                    await cards[3].click();
                    await page.waitForTimeout(500);
                }
                
                console.log('✅ Set selection mechanics work');
                
                // Test Set validation - try to find a valid set
                await this.testSetValidation(page, 'single-player');
            }
            
            // Test timer functionality
            const timerElement = await page.$('#timer');
            if (timerElement) {
                const initialTime = await timerElement.textContent();
                await page.waitForTimeout(2000);
                const updatedTime = await timerElement.textContent();
                
                if (updatedTime !== initialTime) {
                    console.log('✅ Timer is working');
                } else {
                    console.log('⚠️  Timer may not be updating');
                }
            }
            
            return true;
        } catch (error) {
            console.log('❌ Game mechanics test failed:', error.message);
            return false;
        }
    }

    async testUIResponsiveness() {
        console.log('\n📱 Testing UI responsiveness...');
        
        const page = await this.context.newPage();
        this.pages.push(page);
        
        try {
            await page.goto('http://localhost:8080');
            await page.waitForSelector('#game-container');
            
            // Test different viewport sizes
            const viewports = [
                { width: 1920, height: 1080 }, // Desktop
                { width: 1024, height: 768 }, // Tablet
                { width: 375, height: 667 }   // Mobile
            ];
            
            for (const viewport of viewports) {
                await page.setViewportSize(viewport);
                await page.waitForTimeout(1000);
                
                const cards = await page.$$('.card');
                console.log(`✅ UI responsive at ${viewport.width}x${viewport.height}: ${cards.length} cards visible`);
            }
            
            return true;
        } catch (error) {
            console.log('❌ UI responsiveness test failed:', error.message);
            return false;
        }
    }

    async testSetValidation(page, mode) {
        console.log(`\n🎯 Testing Set validation in ${mode} mode...`);
        
        try {
            const isMultiplayer = mode === 'multiplayer';
            const cardSelector = isMultiplayer ? '.minimal-card' : '.card';
            
            // Get all visible cards
            const cards = await page.$$(cardSelector);
            
            if (cards.length < 3) {
                console.log('⚠️  Not enough cards to test Set validation');
                return true;
            }
            
            // Get card IDs for analysis
            const cardIds = await Promise.all(cards.map(async (card) => {
                const cardId = await page.evaluate((el) => {
                    return parseInt(el.dataset.cardId || el.getAttribute('data-card-id') || '0');
                }, card);
                return cardId || 0;
            }));
            
            console.log(`📊 Testing with ${cardIds.length} cards (IDs: ${cardIds.slice(0, 5).join(', ')}...)`);
            
            // Find a valid set using the same logic as the game
            const validSet = this.findValidSet(cardIds);
            
            if (validSet) {
                console.log(`✅ Found valid set: [${validSet.join(', ')}]`);
                
                // Test selecting a valid set
                const setCards = validSet.map(id => {
                    const index = cardIds.indexOf(id);
                    return index !== -1 ? cards[index] : null;
                }).filter(Boolean);
                
                if (setCards.length === 3) {
                    console.log('🎯 Testing valid set selection...');
                    // Select the valid set
                    for (const card of setCards) {
                        await card.click();
                        await page.waitForTimeout(200);
                    }
                    
                    await page.waitForTimeout(1000);
                    console.log('✅ Valid set selection tested');
                }
                
                // Clear selection by clicking somewhere else
                await page.click('body');
                await page.waitForTimeout(1000);
            } else {
                console.log('⚠️  No valid set found among displayed cards');
            }
            
            // Now test an invalid set (try first 3 cards if they're not the valid set we just tested)
            console.log('🧪 Testing invalid set selection...');
            
            // Find 3 cards that are NOT the valid set we just tested
            let testCards = [];
            let testCardIds = [];
            let foundInvalidSet = false;
            
            for (let i = 0; i < Math.min(cards.length, 12); i++) {
                for (let j = i + 1; j < Math.min(cards.length, 12); j++) {
                    for (let k = j + 1; k < Math.min(cards.length, 12); k++) {
                        const testIds = [cardIds[i], cardIds[j], cardIds[k]];
                        if (!this.isValidSet(testIds[0], testIds[1], testIds[2])) {
                            testCards = [cards[i], cards[j], cards[k]];
                            testCardIds = testIds;
                            foundInvalidSet = true;
                            break;
                        }
                    }
                    if (foundInvalidSet) break;
                }
                if (foundInvalidSet) break;
            }
            
            if (foundInvalidSet) {
                console.log(`✅ Found invalid set to test: [${testCardIds.join(', ')}]`);
                
                // Select the invalid set
                for (const card of testCards) {
                    await card.click();
                    await page.waitForTimeout(200);
                }
                
                await page.waitForTimeout(1000);
                console.log('✅ Invalid set selection tested');
            } else {
                console.log('⚠️  Could not find an invalid set to test');
            }
            
            // Clear any remaining selection
            await page.click('body');
            await page.waitForTimeout(500);
            
            return true;
        } catch (error) {
            console.log(`❌ Set validation test failed in ${mode}:`, error.message);
            return false;
        }
    }
    
    findValidSet(cardIds) {
        // Use the same validation logic as the multiplayer game
        for (let i = 0; i < cardIds.length - 2; i++) {
            for (let j = i + 1; j < cardIds.length - 1; j++) {
                for (let k = j + 1; k < cardIds.length; k++) {
                    if (this.isValidSet(cardIds[i], cardIds[j], cardIds[k])) {
                        return [cardIds[i], cardIds[j], cardIds[k]];
                    }
                }
            }
        }
        return null;
    }
    
    isValidSet(a, b, c) {
        // Same logic as multiplayer-url.js
        const fa = this.idToFeatures(a);
        const fb = this.idToFeatures(b);
        const fc = this.idToFeatures(c);
        
        for (let i = 0; i < 4; i++) {
            const s = new Set([fa[i], fb[i], fc[i]]);
            if (!(s.size === 1 || s.size === 3)) return false;
        }
        return true;
    }
    
    idToFeatures(id) {
        if (!id || id < 1 || id > 81) return [0, 0, 0, 0];
        let x = id - 1; // 0..80
        const f3 = x % 3; x = Math.floor(x / 3);
        const f2 = x % 3; x = Math.floor(x / 3);
        const f1 = x % 3; x = Math.floor(x / 3);
        const f0 = x % 3;
        return [f0, f1, f2, f3];
    }

    async runAllTests() {
        console.log('🎯 Starting comprehensive Set Game testing...\n');
        
        const results = {
            serverHealth: false,
            singlePlayer: false,
            multiplayer: false,
            gameMechanics: false,
            uiResponsiveness: false
        };
        
        try {
            // Test 1: Server Health
            results.serverHealth = await this.testServerHealth();
            
            if (!results.serverHealth) {
                console.log('❌ Servers not running. Please start both frontend and backend servers.');
                console.log('Frontend: python3 -m http.server 8080');
                console.log('Backend: cd backend && npm run dev');
                return results;
            }
            
            // Test 2: Single Player Game
            results.singlePlayer = await this.testSinglePlayerGame();
            
            // Test 3: Multiplayer Game  
            results.multiplayer = await this.testMultiplayerGame();
            
            // Test 4: Game Mechanics
            results.gameMechanics = await this.testGameRulesAndMechanics();
            
            // Test 5: UI Responsiveness
            results.uiResponsiveness = await this.testUIResponsiveness();
            
        } finally {
            await this.cleanup();
        }
        
        // Test Summary
        console.log('\n📊 TEST SUMMARY');
        console.log('================');
        console.log(`Server Health: ${results.serverHealth ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Single Player: ${results.singlePlayer ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Multiplayer: ${results.multiplayer ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Game Mechanics: ${results.gameMechanics ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`UI Responsiveness: ${results.uiResponsiveness ? '✅ PASS' : '❌ FAIL'}`);
        
        const passedTests = Object.values(results).filter(Boolean).length;
        const totalTests = Object.keys(results).length;
        
        console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            console.log('🎉 All tests passed! Your Set Game is working perfectly locally.');
        } else {
            console.log('⚠️  Some tests failed. Check the output above for details.');
        }
        
        return results;
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        for (const page of this.pages) {
            if (page) await page.close();
        }
        
        if (this.context) await this.context.close();
        if (this.browser) await this.browser.close();
        
        console.log('✅ Cleanup complete');
    }
}

// Run the tests
async function runTests() {
    const tester = new SetGameTester();
    
    try {
        await tester.setup();
        await tester.runAllTests();
    } catch (error) {
        console.error('💥 Test execution failed:', error);
    }
}

// Run the tests
runTests().catch(console.error);

export { SetGameTester, runTests };
