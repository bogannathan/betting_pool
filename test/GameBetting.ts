import { expect } from 'chai'
import { ethers } from 'hardhat'

const noMultiplier = ethers.MaxUint256

ethers.provider.resolveName = async (name) => {
  return name // mock ens name resolution
}
import { BettingToken, BettingNFT, MultiAssetBettingToken, BettingPool } from '../typechain-types'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

const initialSupply = 10000000000
const amountToDistribute = ethers.parseUnits('1000', 18)
const baseBetAmount = ethers.parseUnits('10', 18)

const getCurrentTimestamp = async () => (await ethers.provider.getBlock('latest'))?.timestamp ?? 0

const increaseTime = async (seconds: number) => {
  await ethers.provider.send('evm_increaseTime', [seconds])
  await ethers.provider.send('evm_mine')
}

describe('BettingPool', () => {
  let company: HardhatEthersSigner,
    user0: HardhatEthersSigner,
    user1: HardhatEthersSigner,
    user2: HardhatEthersSigner,
    user3: HardhatEthersSigner,
    user4: HardhatEthersSigner,
    user5: HardhatEthersSigner,
    user6: HardhatEthersSigner,
    user7: HardhatEthersSigner,
    user8: HardhatEthersSigner,
    user9: HardhatEthersSigner
  let bettingToken: BettingToken
  let bettingNFT: BettingNFT
  let multiAssetBettingToken: MultiAssetBettingToken
  let bettingPool: BettingPool
  let matchId: bigint

  const doTestSetup = async () => {
    [company, user0, user1, user2, user3, user4, user5, user6, user7, user8, user9] = await ethers.getSigners()

    const BettingTokenFactory = await ethers.getContractFactory('BettingToken')
    bettingToken = await BettingTokenFactory.connect(company).deploy(
      ethers.parseUnits(initialSupply.toString(), 18)
    )

    const BettingNFTFactory = await ethers.getContractFactory('BettingNFT')
    bettingNFT = await BettingNFTFactory.connect(company).deploy()

    const MultiAssetBettingTokenFactory = await ethers.getContractFactory('MultiAssetBettingToken')
    multiAssetBettingToken = await MultiAssetBettingTokenFactory.connect(company).deploy()

    const BettingPoolFactory = await ethers.getContractFactory('BettingPool')
    bettingPool = await BettingPoolFactory.connect(company).deploy(
      bettingToken.target,
      bettingNFT.target,
      multiAssetBettingToken.target
    )

    await multiAssetBettingToken.connect(company).setBettingPool(bettingPool.target);
    await bettingNFT.connect(company).setBettingPool(bettingPool.target);
    await multiAssetBettingToken.connect(company).transferOwnership(bettingPool.target)
    await bettingNFT.connect(company).transferOwnership(bettingPool.target)
  }

  before(async () => {
    await doTestSetup()
  })

  describe('Deployment', () => {
    it('Should deploy all contracts correctly', async () => {
      expect(bettingToken.target).to.be.properAddress
      expect(bettingNFT.target).to.be.properAddress
      expect(multiAssetBettingToken.target).to.be.properAddress
      expect(bettingPool.target).to.be.properAddress
    })

    it('Should mint ERC20 tokens to the company account', async () => {
      const companyBalance = await bettingToken.balanceOf(company.address)
      expect(companyBalance).to.equal(ethers.parseUnits(initialSupply.toString(), 18))
    })

    it('Should distribute ERC20 tokens to 5 users', async () => {
      await bettingToken.connect(company).transfer(user0.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user1.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user2.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user3.address, amountToDistribute)

      for (const user of [user0, user1, user2, user3]) {
        const balance = await bettingToken.balanceOf(user.address)
        expect(balance).to.equal(amountToDistribute)
      }
    })
  })

  describe('playGame', () => {
    describe('createMatch', () => {
      it('Should allow the owner to create a match with a future expiration time', async () => {
        const expirationTime = (await getCurrentTimestamp() ?? 0) + 3600

        await expect(bettingPool.connect(company).createMatch(expirationTime))
          .to.emit(bettingPool, 'MatchCreated')
          .withArgs(1, expirationTime)

        const tx = await bettingPool.connect(company).createMatch(expirationTime)
        const receipt = await tx.wait()

        const eventTopic = ethers.id('MatchCreated(uint256,uint256)')
        const event = receipt!.logs.find(log => log.topics[0] === eventTopic)

        const decoded = bettingPool.interface.decodeEventLog(
          'MatchCreated',
          event!.data,
          event!.topics
        )

        const eventMatchId = decoded.matchId

        const nextMatchId = await bettingPool.nextMatchId()
        expect(eventMatchId).to.equal(nextMatchId - BigInt(1))

        matchId = eventMatchId
      })

      it('Should revert if expiration time is in the past', async () => {
        const expirationTime = (await getCurrentTimestamp() ?? 0) - 3600
        await expect(
          bettingPool.connect(company).createMatch(expirationTime)
        ).to.be.revertedWith('Expiration time must be in the future')
      })
    })

    describe('placeBet', () => {
      let tokenId: bigint = BigInt(0)

      beforeEach(async () => {
        const expirationTime = (await getCurrentTimestamp() ?? 0) + 3600
        const tx = await bettingPool.connect(company).createMatch(expirationTime)
        const receipt = await tx.wait()

        const eventTopic = ethers.id('MatchCreated(uint256,uint256)')
        const event = receipt!.logs.find(log => log.topics[0] === eventTopic)

        const decoded = bettingPool.interface.decodeEventLog('MatchCreated', event!.data, event!.topics)
        matchId = decoded.matchId

        const rarity = Math.max(2, (Math.floor(Math.random() * 10) * 2))
        const nftTx = await bettingPool.connect(company).mintBettingNFT(user0.address, rarity)
        const nftReceipt = await nftTx.wait()

        const mintEventTopic = ethers.id('NFTMinted(address,uint256,uint256)')
        const mintEvent = nftReceipt!.logs.find(log => log.topics[0] === mintEventTopic)

        const decodedMintEvent = bettingNFT.interface.decodeEventLog(
          'NFTMinted',
          mintEvent!.data,
          mintEvent!.topics
        )

        tokenId = decodedMintEvent.tokenId

        const multiplier = await bettingNFT.getMultiplier(user0.address, tokenId)

        expect(multiplier).to.equal(1 + rarity / 2)
      })

      it('Should allow a user to place a bet on Team A', async () => {
        const betAmount = ethers.parseUnits('100', 18)
        await bettingToken.connect(user0).approve(bettingPool.target, betAmount)

        await expect(bettingPool.connect(user0).placeBet(matchId, betAmount, true, noMultiplier))
          .to.emit(bettingPool, 'BetPlaced')
          .withArgs(matchId, user0.address, betAmount, true, 1)

        const contractBet = await bettingPool.bets(matchId, 0)
        expect(contractBet.bettor).to.equal(user0.address)
        expect(contractBet.amount).to.equal(betAmount)
        expect(contractBet.betOnTeamA).to.be.true
        expect(contractBet.multiplier).to.equal(1)
      })

      it('Should allow a user to place a bet on Team B', async () => {
        const betAmount = ethers.parseUnits('100', 18)
        await bettingToken.connect(user1).approve(bettingPool.target, betAmount)

        await expect(bettingPool.connect(user1).placeBet(matchId, betAmount, false, noMultiplier))
          .to.emit(bettingPool, 'BetPlaced')
          .withArgs(matchId, user1.address, betAmount, false, 1)

        const contractBet = await bettingPool.bets(matchId, 0)
        expect(contractBet.bettor).to.equal(user1.address)
        expect(contractBet.amount).to.equal(betAmount)
        expect(contractBet.betOnTeamA).to.be.false
        expect(contractBet.multiplier).to.equal(1)
      })

      it('Should allow a user to place a bet with multiplier', async () => {
        const betAmount = ethers.parseUnits('100', 18)
        await bettingToken.connect(user0).approve(bettingPool.target, betAmount)
        await bettingPool.connect(user0).placeBet(matchId, betAmount, true, tokenId)

        const contractBet = await bettingPool.bets(matchId, 0)

        const storedRarity = await bettingNFT.nftRarity(tokenId)

        expect(contractBet.bettor).to.equal(user0.address)
        expect(contractBet.amount).to.equal(betAmount)
        expect(contractBet.betOnTeamA).to.be.true
        expect(contractBet.multiplier).to.equal(BigInt(1) + (storedRarity/BigInt(2)))
      })

      it('Should emit BetPlaced with multiplier', async () => {
        const betAmount = ethers.parseUnits('100', 18)
        const rarity = 10
        const nftTx = await bettingPool.connect(company).mintBettingNFT(user0.address, rarity)
        const nftReceipt = await nftTx.wait()
        tokenId = await bettingNFT.totalSupply() - 1n
        const storedRarity = await bettingNFT.nftRarity(tokenId)
        await bettingToken.connect(user0).approve(bettingPool.target, betAmount)
        await expect(bettingPool.connect(user0).placeBet(matchId, betAmount, true, tokenId))
          .to.emit(bettingPool, 'BetPlaced')
          .withArgs(matchId, user0.address, betAmount, true, BigInt(1) + (storedRarity/BigInt(2)))
      })

      it('Should revert if the user tries to place a bet after the expiration time', async () => {
        const expirationTime = (await getCurrentTimestamp() ?? 0) + 3600
        await bettingPool.connect(company).createMatch(expirationTime)
        const expiredMatchId = await bettingPool.nextMatchId() - BigInt(1)

        await increaseTime(3601)

        const betAmount = ethers.parseUnits('100', 18)
        await bettingToken.connect(user0).approve(bettingPool.target, betAmount)

        await expect(
          bettingPool.connect(user0).placeBet(expiredMatchId, betAmount, true, noMultiplier)
        ).to.be.revertedWith('Betting period has ended')
      })

      it('Should revert if the user tries to place a bet with insufficient balance', async () => {
        const betAmount = ethers.parseUnits('1000', 18)
        await bettingToken.connect(user0).approve(bettingPool.target, betAmount)

        await expect(
          bettingPool.connect(user0).placeBet(matchId, betAmount, true, noMultiplier)
        ).to.be.revertedWith('Insufficient balance')
      })

      it('Should allow two users to bet on the same match but on opposite teams', async () => {
        const betAmount1 = ethers.parseUnits('100', 18)
        const betAmount2 = ethers.parseUnits('200', 18)

        await bettingToken.connect(user0).approve(bettingPool.target, betAmount1)
        await bettingPool.connect(user0).placeBet(matchId, betAmount1, true, noMultiplier)

        await bettingToken.connect(user1).approve(bettingPool.target, betAmount2)
        await bettingPool.connect(user1).placeBet(matchId, betAmount2, false, noMultiplier)

        const storedBet1 = await bettingPool.bets(matchId, 0)
        const storedBet2 = await bettingPool.bets(matchId, 1)

        expect(storedBet1.bettor).to.equal(user0.address)
        expect(storedBet1.amount).to.equal(betAmount1)
        expect(storedBet1.betOnTeamA).to.be.true

        expect(storedBet2.bettor).to.equal(user1.address)
        expect(storedBet2.amount).to.equal(betAmount2)
        expect(storedBet2.betOnTeamA).to.be.false
      })

      it('Should allow two users to bet on the same team for the same match', async () => {
        const betAmount1 = ethers.parseUnits('150', 18)
        const betAmount2 = ethers.parseUnits('250', 18)

        await bettingToken.connect(user3).approve(bettingPool.target, betAmount1)
        await bettingPool.connect(user3).placeBet(matchId, betAmount1, true, noMultiplier)

        await bettingToken.connect(user2).approve(bettingPool.target, betAmount2)
        await bettingPool.connect(user2).placeBet(matchId, betAmount2, true, noMultiplier)

        const storedBet1 = await bettingPool.bets(matchId, 0)
        const storedBet2 = await bettingPool.bets(matchId, 1)

        expect(storedBet1.bettor).to.equal(user3.address)
        expect(storedBet1.amount).to.equal(betAmount1)
        expect(storedBet1.betOnTeamA).to.be.true

        expect(storedBet2.bettor).to.equal(user2.address)
        expect(storedBet2.amount).to.equal(betAmount2)
        expect(storedBet2.betOnTeamA).to.be.true
      })
    })
  })

  describe('resolveMatch', () => {
    let matchId: bigint
    let betAmount1: bigint, betAmount2: bigint, betAmount3: bigint
    let tokenId: bigint

    beforeEach(async () => {
      await bettingToken.connect(company).transfer(user4.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user5.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user6.address, amountToDistribute)

      const expirationTime = (await getCurrentTimestamp() ?? 0) + 3600

      const tx = await bettingPool.connect(company).createMatch(expirationTime)
      const receipt = await tx.wait()
      const eventTopic = ethers.id('MatchCreated(uint256,uint256)')
      const event = receipt!.logs.find(log => log.topics[0] === eventTopic)
      const decoded = bettingPool.interface.decodeEventLog('MatchCreated', event!.data, event!.topics)
      matchId = decoded.matchId

      betAmount1 = baseBetAmount
      betAmount2 = 2n * baseBetAmount
      betAmount3 = 3n * baseBetAmount

      const rarity = 10
      const nftTx = await bettingPool.connect(company).mintBettingNFT(user4.address, rarity)
      await nftTx.wait()
      tokenId = await bettingNFT.totalSupply()

      await bettingToken.connect(user4).approve(bettingPool.target, betAmount1)
      await bettingPool.connect(user4).placeBet(matchId, betAmount1, true, tokenId)

      await bettingToken.connect(user5).approve(bettingPool.target, betAmount2)
      await bettingPool.connect(user5).placeBet(matchId, betAmount2, false, noMultiplier)

      await bettingToken.connect(user6).approve(bettingPool.target, betAmount3)
      await bettingPool.connect(user6).placeBet(matchId, betAmount3, true, noMultiplier)

      await increaseTime(3601)
    })

    it('Should resolve the match and verify exact balances, bonuses, and winnings', async () => {
      const multiplier = await bettingNFT.getMultiplier(user4.address, tokenId)
      await bettingPool.connect(company).resolveMatch(matchId, true) // team a wins

      const user4BalanceAfter = await bettingToken.balanceOf(user4.address)
      const user5BalanceAfter = await bettingToken.balanceOf(user5.address)
      const user6BalanceAfter = await bettingToken.balanceOf(user6.address)

      const totalPool = baseBetAmount * 6n
      const winnerPool = baseBetAmount * 4n

      const user4PoolWinnings = (betAmount1 * totalPool) / winnerPool
      const user4Bonus = betAmount1 * (multiplier - 1n)

      const user6PoolWinnings = (betAmount3 * totalPool) / winnerPool
      const user4ExpectedBalance = amountToDistribute - betAmount1 + user4PoolWinnings + user4Bonus
      const user6ExpectedBalance = amountToDistribute - betAmount3 + user6PoolWinnings

      expect(user4BalanceAfter).to.equal(user4ExpectedBalance)
      expect(user5BalanceAfter).to.equal(amountToDistribute - betAmount2)
      expect(user6BalanceAfter).to.equal(user6ExpectedBalance)

      const user4WinnerTokens = await multiAssetBettingToken.balanceOf(user4.address, 1)
      const user5LoserTokens = await multiAssetBettingToken.balanceOf(user5.address, 2)
      const user6WinnerTokens = await multiAssetBettingToken.balanceOf(user6.address, 1)

      expect(user4WinnerTokens).to.equal(1n)
      expect(user5LoserTokens).to.equal(1n)
      expect(user6WinnerTokens).to.equal(1n)
    })
  })

  describe('cancelMatch', () => {
    let matchId: bigint
    let betAmount1: bigint, betAmount2: bigint, betAmount3: bigint

    beforeEach(async () => {
      await bettingToken.connect(company).transfer(user7.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user8.address, amountToDistribute)
      await bettingToken.connect(company).transfer(user9.address, amountToDistribute)

      const expirationTime = (await getCurrentTimestamp() ?? 0) + 3600

      await ethers.provider.send('evm_mine')
      const tx = await bettingPool.connect(company).createMatch(expirationTime)
      const receipt = await tx.wait()
      const eventTopic = ethers.id('MatchCreated(uint256,uint256)')
      const event = receipt!.logs.find(log => log.topics[0] === eventTopic)
      const decoded = bettingPool.interface.decodeEventLog('MatchCreated', event!.data, event!.topics)
      matchId = decoded.matchId

      betAmount1 = baseBetAmount
      betAmount2 = 2n * baseBetAmount
      betAmount3 = 3n * baseBetAmount

      await bettingToken.connect(user7).approve(bettingPool.target, betAmount1)
      await bettingPool.connect(user7).placeBet(matchId, betAmount1, true, noMultiplier)

      await bettingToken.connect(user8).approve(bettingPool.target, betAmount2)
      await bettingPool.connect(user8).placeBet(matchId, betAmount2, false, noMultiplier)

      await bettingToken.connect(user9).approve(bettingPool.target, betAmount3)
      await bettingPool.connect(user9).placeBet(matchId, betAmount3, true, noMultiplier)
    })

    it('Should cancel the match and refund all user bets', async () => {
      await expect(bettingPool.connect(company).cancelMatch(matchId))
        .to.emit(bettingPool, 'MatchCanceled')
        .withArgs(matchId)

      const user7BalanceAfter = await bettingToken.balanceOf(user7.address)
      const user8BalanceAfter = await bettingToken.balanceOf(user8.address)
      const user9BalanceAfter = await bettingToken.balanceOf(user9.address)

      expect(user7BalanceAfter).to.equal(amountToDistribute)
      expect(user8BalanceAfter).to.equal(amountToDistribute)
      expect(user9BalanceAfter).to.equal(amountToDistribute)

      const totalPoolTeamA = await bettingPool.totalPoolTeamA(matchId)
      const totalPoolTeamB = await bettingPool.totalPoolTeamB(matchId)

      expect(totalPoolTeamA).to.equal(0)
      expect(totalPoolTeamB).to.equal(0)
    })

    it('Should revert if the match is already resolved or canceled', async () => {
      await bettingPool.connect(company).cancelMatch(matchId)

      await expect(bettingPool.connect(company).cancelMatch(matchId)).to.be.revertedWith('Match is not active or already canceled')
    })
  })
})
