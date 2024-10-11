## BettingPool: A Multi-Asset Decentralized Betting Platform

I made BettingPool as a decentralized betting platform that brings together ERC20, ERC721, and ERC1155 tokens. My goal here was to show my understanding of building complex, multi-asset systems that can handle a variety of user interactions and demonstrate my approach to secure and scalable contract development.

I tried to think through how a gaming company might want to create livestreaming/competitive gaming economies. The whole idea was to create something that allowed for some more in-depth and recurring interactions from users.

Hopefully, you can see into my thought process and how I approach problems. Thanks!

---

## Features

### Multi-Asset Support

- **ERC20** for the native betting token (`WinTheFight` or WTF).
- **ERC721** tokens aren’t collectibles in this system, they are one-time use rewards that users can burn to increase their payout on a bet if they win, based on the rarity of the NFT. By giving players tokens only when they lose, it incentivizes losers to keep playing.
- **ERC1155** tokens for rewards (winner/loser tokens). ERC1155 is future-proofed for compatibility with additional token types down the road.

### Decentralized Betting

- **Match Creation**: Right now, the owner is responsible for creating matches, but it would be nice if there were a less arbitrary way of creating matches.
- **Bet Placement**: Users place bets using WBX, and they can optionally apply their NFTs to boost potential winnings. The multiplier is tied to the NFT’s rarity
- **Reward Distribution**: At the end of a match, winners receive ERC1155 winner tokens, and losers get **loser tokens** to be redeemed for rarity NFTs.

---

## Security Considerations

- `OnlyBettingPool` created a modifier that protected the 721 and 1155 contracts from the contract owner being able to call mint, burn.
- `ReentrancyGuard` to safeguard against reentrancy attacks for token transfers and such.
- `Ownable` pattern to limit actions like match creation and triggering resolution.
- `Pausable` in case of any unforeseen issues, allowing a quick response without halting the entire system permanently.

---

## More tests to complete
1. Test multiple matches
2. Cash in loser tokens for an nft, protect against edge cases
3. Test weird match outcomes, like even bets of Team A vs Team B, no bets for one side, no bets for either
4. Status tests, like making sure canceled/resolved matches can't somehow be resolved again
5. Gas Efficiency tests for various combinations of user and bet scaling. Perhaps can change the way BettingPool stores and access matches and bets to reduce public struct calls. Bets may become too long of a list to efficiently use as is.

---

## Ideal Next Steps

### Oracle integration
The owner manually resolves too much, but the next step would be to integrate an oracle like ChainLink to decentralize match results from human intervention

### NFT mechanics
This project lends itself to some fun mechanics to mix in with the current gameplay. 

### Dynamic odds adjustment 
For when one side has way more than the other

### Quality of life updates 
Update expiration to account for delayed matches, getters for useful information

### Betting Limits

### Escrow for Winnings

---

## Testing

Hardhat is the bomb, makes test-driven development easy. I started with several of the happy-path cases testing add added some edge cases. There are certainly more I would address moving forward, just a starting point

Run the tests like so

```bash
npm install
npx hardhat test
```