// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "hardhat/console.sol";

contract MultiAssetBettingToken is ERC1155, Ownable {
    uint256 public constant WINNER_TOKEN_ID = 1;
    uint256 public constant LOSER_TOKEN_ID = 2;

    address public bettingPool; // This will be set after deployment

    constructor() ERC1155("https://theinternet.com/api/item/{id}.json") Ownable(msg.sender) {}

    modifier onlyBettingPool() {
        require(msg.sender == bettingPool, "Caller is not the BettingPool contract");
        _;
    }

    function setBettingPool(address _bettingPool) external onlyOwner {
        require(_bettingPool != address(0), "Invalid address for BettingPool");
        bettingPool = _bettingPool;
    }

    function mintWinner(address to, uint256 amount) public onlyBettingPool {
        _mint(to, WINNER_TOKEN_ID, amount, "");
    }

    function mintLoser(address to, uint256 amount) public onlyBettingPool {
        _mint(to, LOSER_TOKEN_ID, amount, "");
    }

    function burnLoserTokens(address from, uint256 amount) public onlyBettingPool {
        _burn(from, LOSER_TOKEN_ID, amount);
    }
}

contract BettingNFT is ERC721Enumerable, Ownable {
    address public bettingPool; // To be set after deployment

    mapping(uint256 => uint256) public nftRarity;

    event NFTMinted(address indexed to, uint256 tokenId, uint256 rarity);

    constructor() ERC721("AThousandNFTs", "TNFT") Ownable(msg.sender) {}

    modifier onlyBettingPool() {
        require(msg.sender == bettingPool, "Caller is not the BettingPool contract");
        _;
    }

    function setBettingPool(address _bettingPool) external onlyOwner {
        require(_bettingPool != address(0), "Invalid address for BettingPool");
        bettingPool = _bettingPool;
    }

    function mintBettingNFT(address to, uint256 rarity) public onlyBettingPool  {
        uint256 tokenId = totalSupply() + 1;
        _mint(to, tokenId);
        nftRarity[tokenId] = rarity;
        emit NFTMinted(to, tokenId, rarity);
    }

    function burn(uint256 tokenId) public onlyBettingPool  {
        _burn(tokenId);
    }

    function getMultiplier(address user, uint256 tokenId) public view returns (uint256) {
        if (ownerOf(tokenId) != user) {
            return 1; // Return default if the user does not own the token anymore
        }

        uint256 rarity = nftRarity[tokenId];
        uint256 multiplier = 1 + (rarity / 2);
        return multiplier;
    }
}

contract BettingToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("WinTheFight", "WTF") {
        _mint(msg.sender, initialSupply);
    }
}

contract BettingPool is Ownable, ReentrancyGuard, Pausable {
    enum MatchStatus { NotStarted, Active, Resolved, Canceled }
    uint256 public constant noMultiplier = type(uint256).max;

    struct Match {
        MatchStatus status;
        bool teamAWon;
        uint256 expirationTime;
    }

    BettingToken public token;
    BettingNFT public nft;
    MultiAssetBettingToken public multiToken;

    uint256 public nextMatchId;
    mapping(uint256 => Match) public matches;
    mapping(uint256 => Bet[]) public bets;
    mapping(uint256 => uint256) public totalPoolTeamA;
    mapping(uint256 => uint256) public totalPoolTeamB;

    struct Bet {
        uint256 amount;
        bool betOnTeamA;
        address bettor;
        uint256 multiplier;
        uint256 nftTokenId;
    }

    event MatchCreated(uint256 matchId, uint256 expirationTime);
    event BetPlaced(uint256 matchId, address bettor, uint256 amount, bool isTeamA, uint256 multiplier);
    event MatchCanceled(uint256 matchId);

    constructor(BettingToken _token, BettingNFT _nft, MultiAssetBettingToken _multiToken) Ownable(msg.sender) {
        token = _token;
        nft = _nft;
        multiToken = _multiToken;
        nextMatchId = 1;
    }

    function createMatch(uint256 _expirationTime) public onlyOwner {
        require(_expirationTime > block.timestamp, "Expiration time must be in the future");
        matches[nextMatchId] = Match({
            status: MatchStatus.Active,
            teamAWon: false,
            expirationTime: _expirationTime
        });

        emit MatchCreated(nextMatchId, _expirationTime);
        nextMatchId++;
    }

    function cancelMatch(uint256 matchId) public onlyOwner nonReentrant {
        require(matches[matchId].status == MatchStatus.Active, "Match is not active or already canceled");
        matches[matchId].status = MatchStatus.Canceled;

        for (uint256 i = 0; i < bets[matchId].length; i++) {
            Bet storage userBet = bets[matchId][i];
            token.transfer(userBet.bettor, userBet.amount);
        }

        emit MatchCanceled(matchId);

        delete bets[matchId];
        totalPoolTeamA[matchId] = 0;
        totalPoolTeamB[matchId] = 0;
    }

    function placeBet(uint256 matchId, uint256 amount, bool betOnTeamA, uint256 nftTokenId) public whenNotPaused {
        require(matches[matchId].status == MatchStatus.Active, "Match is not available for betting");
        require(block.timestamp < matches[matchId].expirationTime, "Betting period has ended");
        require(amount > 0, "Bet amount must be greater than zero");
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");

        token.transferFrom(msg.sender, address(this), amount);

        uint256 multiplier = 1;
        if (nftTokenId != noMultiplier) {
            require(nft.ownerOf(nftTokenId) == msg.sender, "You do not own this NFT");
            multiplier = nft.getMultiplier(msg.sender, nftTokenId);
        }

        Bet memory newBet = Bet({
            amount: amount,
            betOnTeamA: betOnTeamA,
            bettor: msg.sender,
            multiplier: multiplier,
            nftTokenId: nftTokenId
        });

        bets[matchId].push(newBet);

        if (betOnTeamA) {
            totalPoolTeamA[matchId] += amount;
        } else {
            totalPoolTeamB[matchId] += amount;
        }

        emit BetPlaced(matchId, msg.sender, amount, betOnTeamA, multiplier);
    }

    function resolveMatch(uint256 matchId, bool teamAWon) public onlyOwner nonReentrant {
        require(matches[matchId].status == MatchStatus.Active, "Match is not active or already resolved/canceled");
        require(block.timestamp >= matches[matchId].expirationTime, "Match has not yet expired");

        matches[matchId].status = MatchStatus.Resolved;
        matches[matchId].teamAWon = teamAWon;

        uint256 totalPool = totalPoolTeamA[matchId] + totalPoolTeamB[matchId];
        uint256 winnerPool = teamAWon ? totalPoolTeamA[matchId] : totalPoolTeamB[matchId];

        for (uint256 i = 0; i < bets[matchId].length; i++) {
            Bet storage userBet = bets[matchId][i];

            if ((teamAWon && userBet.betOnTeamA) || (!teamAWon && !userBet.betOnTeamA)) {
                uint256 poolWinnings = (userBet.amount * totalPool) / winnerPool;
                uint256 bonus = (userBet.amount * (userBet.multiplier - 1));
                token.transfer(userBet.bettor, poolWinnings + bonus);

                multiToken.mintWinner(userBet.bettor, 1);
                if (userBet.nftTokenId != noMultiplier) {
                    nft.burn(userBet.nftTokenId);
                }
            } else {
                multiToken.mintLoser(userBet.bettor, 1);
            }
        }

        delete bets[matchId];
        totalPoolTeamA[matchId] = 0;
        totalPoolTeamB[matchId] = 0;
    }

    function cashInLoserTokensForNFT(uint256 loserTokenAmount) public nonReentrant {
        require(loserTokenAmount > 0, "Must burn at least one loser token");
        require(loserTokenAmount % 10 == 0, "Loser token amount must be divisible by 10");

        multiToken.burnLoserTokens(msg.sender, loserTokenAmount);

        nft.mintBettingNFT(msg.sender, loserTokenAmount/10);
    }

    function mintBettingNFT(address to, uint256 rarity) public onlyOwner {
        nft.mintBettingNFT(to, rarity);
    }
}
