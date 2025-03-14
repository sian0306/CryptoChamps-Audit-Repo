// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { AbiCoder, solidityPackedKeccak256, parseUnits, getBytes, assert, formatEther } = require("ethers");
const { ethers, network } = require("hardhat");

describe("SafeMoonLikeToken Contract", function () {
  let token;
  let wETHHolder
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let uniswapRouter;
  let uniswapRouterAddress;
  let wethAddress;
  let liquidityPool;
  let wethToken;
  const initialSupply = ethers.parseUnits("1000000000", 18); // 1 Billion tokens
  const buyTax = 5; // 5%
  const sellTax = 5; // 5%
  const liquidityAllocation = 2; // 2%
  const reflectionAllocation = 3; // 3%
  const MINIMUM_HOLDING_FOR_REFLECTION = ethers.parseUnits("250", 18); // 250,000 tokens
  const amountSafeMoon = ethers.parseUnits("2000000000", 18); // Amount of SafeMoon token to add as liquidity
  const amountWETH = ethers.parseEther("1"); // Amount of WETH to add as liquidity
  let not_added = true

  beforeEach(async () => {
    // Get signers
    [owner, admin, addr1, addr2, addr3] = await ethers.getSigners();
    console.log("owner.address : ", owner.address);
    console.log("admin.address : ", admin.address);
    console.log("addr1.address : ", addr1.address);
    console.log("addr2.address : ", addr2.address);
    console.log("addr3.address : ", addr3.address);
    // Fetch the Uniswap V2 Router contract from forked mainnet
    uniswapRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";  // Replace with the actual Uniswap V2 Router address
    uniswapRouter = await ethers.getContractAt("IUniswapV2Router02", uniswapRouterAddress);
    wethAddress = await uniswapRouter.WETH();
    wethToken = await ethers.getContractAt("WETH9", wethAddress);
    uniswapRouter.address = uniswapRouter.target
    // Deploy the SafeMoonLikeToken contract
    const WETHHolder = await ethers.getContractFactory("WETHHolder");
    wETHHolder = await WETHHolder.deploy(owner.address);
    await wETHHolder.waitForDeployment();
    console.log("wETHHolder Contract Address : ", wETHHolder.target);

    const SafeMoonLikeToken = await ethers.getContractFactory("SafeMoonLikeToken");
    token = await SafeMoonLikeToken.deploy(uniswapRouterAddress, admin.address, wETHHolder.target);
    await token.waitForDeployment();
    console.log("SafeMoon Contract Address : ", token.target);

    await wETHHolder.transferOwnership(token.target)

    // Set liquidity pool address
    liquidityPool = await token.liquidityPool();
    console.log("liquidityPool", liquidityPool)
    // await token.excludeFromFees(wETHHolder.target, true)
    // await token.excludeFromFees(owner.address, true)
    // await token.excludeFromFees(owner.address, true)
    await token.approve(uniswapRouterAddress, amountSafeMoon);

    await uniswapRouter.addLiquidityETH(
      token.target, // SafeMoon token address
      amountSafeMoon,   // Amount of SafeMoon to add
      0,                // Min amount of SafeMoon (set to 0 for now)
      0,                // Min amount of ETH (set to 0 for now)
      owner.address,    // Address where liquidity tokens are sent
      Math.floor(Date.now() / 1000) + 60 * 10, // Deadline (10 minutes from now)
      { value: amountWETH } // Add ETH value here
    );
    //  await token.excludeFromFees(liquidityPool, false)
  });

  describe("Deployment", () => {
    it("Should set the correct token name and symbol", async () => {
      expect(await token.name()).to.equal("SafeMoon");
      expect(await token.symbol()).to.equal("$SM");
    });

    it("Should create a liquidity pool upon deployment", async () => {
      expect(liquidityPool).to.not.equal(ethers.ZeroAddress);
    });
  });


  describe("Taxation", () => {
    it("Should correctly set buy and sell taxes", async () => {
      await token.setTaxes(6, 4);
      expect(await token.buyTax()).to.equal(6);
      expect(await token.sellTax()).to.equal(4);
    });

    it("Should revert if taxes exceed 10%", async () => {
      await expect(token.setTaxes(11, 5)).to.be.revertedWith("Tax cannot exceed 10%");
    });

    it("Should apply taxes on transfer", async () => {
      const amount = ethers.parseUnits("100", 18);

      // Exclude addr1 from fees
      // await token.excludeFromFees(addr1.address, true);
      console.log("Before WETH Balance :", formatEther(await wethToken.balanceOf(token.target)));
      // Transfer tokens from owner to addr1, should not apply tax
      await token.transfer(addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);

      console.log("DONE")

      console.log(formatEther(await token.balanceOf(addr2.address)), "Before Tax Amount");
      console.log(formatEther(await token.balanceOf(addr1.address)), "Addr1 Before Tax Amount");
      // Now, include addr2 and transfer, should apply taxes
      // await token.excludeFromFees(addr1.address, false);
      await token.connect(addr1).transfer(addr2.address, amount);

      console.log("After WETH Balance :", formatEther(await wethToken.balanceOf(token.target)));
      // const taxAmount = (amount * BigInt(buyTax)) / BigInt(100);
      // const amountAfterTax = amount - taxAmount;
      console.log(formatEther(await token.balanceOf(addr2.address)), "After Tax Amount");
      // expect(await token.balanceOf(addr2.address)).to.equal(amountAfterTax);
    });

    it("Should apply taxes on transferFrom", async () => {
      const amount = ethers.parseUnits("100", 18);

      // Exclude addr1 from fees
      // await token.excludeFromFees(addr1.address, true);
      console.log("Before WETH Balance :", formatEther(await wethToken.balanceOf(token.target)));
      // Transfer tokens from owner to addr1, should not apply tax
      await token.connect(owner).approve(addr1.address, amount);
      await token.connect(addr1).transferFrom(owner.address, addr1.address, amount);
      expect(await token.balanceOf(addr1.address)).to.equal(amount);

      console.log("DONE")

      console.log(formatEther(await token.balanceOf(addr2.address)), "Before Addr2 Tax Amount");
      console.log(formatEther(await token.balanceOf(addr1.address)), "Before Addr1 Tax Amount");
      // Now, include addr2 and transfer, should apply taxes
      // await token.excludeFromFees(addr1.address, false);
      console.log("00");
      await token.connect(addr1).approve(addr2.address, amount);
      console.log("11");
      await token.connect(addr2).transferFrom(addr1.address, addr2.address, amount);
      console.log("22");
      console.log("After WETH Balance :", formatEther(await wethToken.balanceOf(token.target)));
      // const taxAmount = (amount * BigInt(buyTax)) / BigInt(100);
      // const amountAfterTax = amount - taxAmount;
      console.log(formatEther(await token.balanceOf(addr2.address)), "After Addr2 Tax Amount");
      // expect(await token.balanceOf(addr2.address)).to.equal(amountAfterTax);
    });
  });


  describe("Swape", () => {

    it("Should apply taxes on transfer", async () => {
      const ethAmount = ethers.parseUnits("0.05", 18);

      console.log("IS Contract Exclude:", await token.isExcludedFromFees(token.target));

      console.log("Balance of addr2 before swap:", formatEther(await token.balanceOf(addr2.address)));

      // Get expected amounts for the swap
      const getamount = await uniswapRouter.getAmountsIn(ethAmount, [token.target, wethAddress]);
      const value = getamount[1].toString();
      const out = getamount[0].toString();

      console.log(formatEther(value), "value");
      console.log(formatEther(out), "out");

      // try {
      // Execute the swap (simulate fee deduction)
      // Ensure the Uniswap router mock is ready for swap (mock the Uniswap router swap behavior in tests)
      // Execute the swap with ETH as value to be swapped
      await uniswapRouter.connect(addr2).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,           // Token Amount to Swap
        [wethAddress, token.target],  // Path from WETH to the token
        addr2.address,      // Receiver address
        Math.floor(Date.now() / 1000) + 60 * 10, // Deadline set to 10 minutes
        { value, gasLimit: 300000, gasPrice: parseUnits('20', 'gwei') } // Send ETH for the swap
      );

      // } catch (error) {
      //   console.log(error);
      // }
      // Check if addr2 received the correct amount of tokens after the fee deduction
      console.log("Balance of addr2 after swap:", formatEther(await token.balanceOf(addr2.address)));
    });
  });

  describe("Reflections", () => {

    it("Should correctly calculate claimable reflections", async () => {
      // Distribute reflections
      const wethBalanceBefore = await wethToken.balanceOf(owner.address);
      await token.transfer(addr2.address, ethers.parseUnits("5000", 18)); // Trigger tax
      const wethBalanceAfter = await wethToken.balanceOf(owner.address);

      // expect(wethBalanceAfter).to.be.gt(wethBalanceBefore);
    });

    it("Should increase Reflection for other holders", async () => {
      // Distribute reflections

      console.log(formatEther(await token.balanceOf(owner.address)))
      await token.transfer(addr1.address, ethers.parseUnits("5000", 18)); // Trigger tax

      const wethBalanceAddr1 = await wethToken.balanceOf(addr1.address);

      // Ensure no reflections are claimable
      let claimableOwner = await token.calculateETHClaimable(owner.address)
      console.log("claimableOwner", claimableOwner)
      // expect(claimableOwner).to.equal(BigInt(0));

      // expect(wethBalanceAddr1).to.be.gt(BigInt(0));
      console.log(formatEther(await token.balanceOf(owner.address)))

      await token.connect(addr1).transfer(addr2.address, ethers.parseUnits("100", 18)); // Trigger tax

      const wethBalanceAddr2 = await wethToken.balanceOf(addr2.address);

      claimableOwner = await token.calculateETHClaimable(owner.address)
      console.log("claimableOwner", claimableOwner)
      // expect(claimableOwner).to.be.gt(BigInt(0));

      await token.transfer(addr2.address, ethers.parseUnits("5000", 18)); // Trigger tax

      // let claim = await token.connect(addr1).claimReflections(addr1.address)


      claimableOwner = await token.calculateETHClaimable(owner.address)
      console.log("claimableOwner", claimableOwner)

      let claimableAddr1 = await token.calculateETHClaimable(addr1.address)
      console.log("claimableAddr1", claimableAddr1)
      // expect(claimableOwner).to.equal(BigInt(0));
      // expect(claimableAddr1).to.equal(BigInt(0));

    });

    it("Should returns minimum Holding For Reflection", async () => {
      let minTokens = ethers.parseUnits("250000", 18);
      // Transfer less than minimum holding
      await token.changeMinimumHoldingForReflection(minTokens);

      // Calculate claimable reflections
      const setMinHoldingAfter = await token.minimumHoldingForReflection();

      // Ensure no reflections are claimable
      expect(setMinHoldingAfter).to.equal(minTokens);
    });
  });

  describe("Reward Claim System", () => {
    it("Should allow the admin to claim reward points with CHP", async function () {

      await token.excludeFromFees(token.target, true)
      // await token.excludeFromFees(addr1.address, true)

      const amount = parseUnits("100", 18);
      const timeNow = Math.floor(Date.now() / 1000) + 60;
      const abiCoder = new AbiCoder();
      const nonce = await token.userNonce(addr1.address);

      // Create the message hash by encoding the addr1 address and amount
      const messageHash2 = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );

      const messageHash = solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );

      await token.connect(owner).transfer(token.target, amount);

      // Sign the message hash with the admin's private key
      const signature = await admin.signMessage(getBytes(messageHash));
      // Admin claims reward points for the addr1
      await token.connect(admin).claimRewardPointsWithCHP(messageHash2, signature);
    });

    it("Should allow the user to claim reward points with WETH", async function () {

      await token.excludeFromFees(token.target, true)
      // await token.excludeFromFees(addr1.address, true)

      const amount = parseUnits("100", 18);
      const timeNow = Math.floor(Date.now() / 1000) + 60;
      const abiCoder = new AbiCoder();
      const nonce = await token.userNonce(addr1.address);

      // Create the message hash by encoding the addr1 address and amount
      const messageHash2 = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );

      const messageHash = solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );

      await wethToken.connect(owner).deposit({ value: amount })
      await wethToken.connect(owner).transfer(token.target, amount);

      // Sign the message hash with the admin's private key
      const signature = await admin.signMessage(getBytes(messageHash));
      // Admin claims reward points for the addr1
      await token.connect(addr1).claimRewardPointsWithETH(messageHash2, signature);
    });

    it("Should fail if the addr1 is calling claim reward points with CHP", async function () {
      await token.excludeFromFees(token.target, true)
      // await token.excludeFromFees(addr1.address, true)

      const amount = parseUnits("100", 18);
      const timeNow = Math.floor(Date.now() / 1000) + 60; // Valid timestamp in the future
      const abiCoder = new AbiCoder();
      const wrongNonce = 9999; // Use a nonce that is not correct for the addr1

      // Create the message hash by encoding the addr1 address, amount, timestamp, and the wrong nonce
      const messageHash2 = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, wrongNonce]
      );

      // Hash the message using the correct fields
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, wrongNonce]
      );

      await token.connect(owner).transfer(token.target, amount);

      // Sign the message hash with the admin's private key
      const signature = await admin.signMessage(getBytes(messageHash));

      // This should fail because the nonce is incorrect
      await expect(token.connect(addr1).claimRewardPointsWithCHP(messageHash2, signature)).to.be.revertedWith("Only Admin Can Call");
    });

    it("Should fail if the nonce is incorrect", async function () {
      await token.excludeFromFees(token.target, true)
      // await token.excludeFromFees(addr1.address, true)

      const amount = parseUnits("100", 18);
      const timeNow = Math.floor(Date.now() / 1000) + 60; // Valid timestamp in the future
      const abiCoder = new AbiCoder();
      const wrongNonce = 9999; // Use a nonce that is not correct for the addr1

      // Create the message hash by encoding the addr1 address, amount, timestamp, and the wrong nonce
      const messageHash2 = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, wrongNonce]
      );

      // Hash the message using the correct fields
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, wrongNonce]
      );

      await token.connect(owner).transfer(token.target, amount);

      // Sign the message hash with the admin's private key
      const signature = await admin.signMessage(getBytes(messageHash));

      // This should fail because the nonce is incorrect
      await expect(token.connect(admin).claimRewardPointsWithCHP(messageHash2, signature)).to.be.revertedWith("Wrong Nonces");
    });

    it("Should fail if the session has timed out", async function () {

      await token.excludeFromFees(token.target, true)
      // await token.excludeFromFees(addr1.address, true)

      const amount = parseUnits("100", 18);
      const timeNow = Math.floor(Date.now() / 1000) - 240; // Set timestamp to the past (expired)
      const abiCoder = new AbiCoder();
      const nonce = await token.userNonce(addr1.address);

      // Create the message hash by encoding the addr1 address, amount, expired timestamp, and nonce
      const messageHash2 = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );

      // Hash the message using the correct fields
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [addr1.address, amount, timeNow, nonce?.toString()]
      );


      await token.connect(owner).transfer(token.target, amount);

      // Sign the message hash with the admin's private key
      const signature = await admin.signMessage(getBytes(messageHash));

      // Fast-forward 6 month
      await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 6 months
      await ethers.provider.send("evm_mine");

      // This should fail because the timestamp is expires
      await expect(token.connect(admin).claimRewardPointsWithCHP(messageHash2, signature)).to.be.revertedWith("Session time out");
    });
  });

});
