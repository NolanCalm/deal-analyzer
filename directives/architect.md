The Master Implementation Plan (Updated & Finalized)

Mission: Build the "Property Deal Analyzer" 48-hour MVP.

1. Project Core

Stack: Vite + React (Standard JS/JSX) + Tailwind CSS.

API Strategy: Use .env.local for the Gemini API Key. (Safe for weekend dev).

Storage: localStorage for persisting the last analyzed deal.

2. Component Architecture Refinements

FileUploader.jsx:

Updated to support mobile camera capture (capture="environment").

State: Shows "AI is auditing pro-forma..." during processing.

PropertyDataCard.jsx:

Added "Confidence Badges": Visual indicators for [ESTIMATED] values.

Inputs: All numeric inputs must trigger the math engine onChange.

InvestmentMetrics.jsx:

New Feature: "Stress Test" toggle. Allows user to bump vacancy from 5% to 10% instantly.

Math Logic: Calculates Cap Rate AND Cash-on-Cash Return.

OfferScorecard.jsx:

The "Print Hack": Uses window.print() with @media print CSS. No external PDF libraries.

3. The "Senior" Math Engine (mathEngine.js)

JavaScript
// constants
const REPAIRS_RATE = 0.02; // 2% of purchase price
const VACANCY_RATE = 0.05; // 5% default

export const calculateROI = (data, loanTerms = { down: 0.2, rate: 0.075, years: 30 }) => {
  const grossAnnual = data.grossRent * 12;
  const expenses = data.propertyTaxes + data.insurance + data.utilities;
  const vacancyLoss = grossAnnual * VACANCY_RATE;
  const repairs = data.askingPrice * REPAIRS_RATE;
  
  const noi = grossAnnual - vacancyLoss - expenses - repairs;
  const capRate = (noi / data.askingPrice) * 100;
  
  // Debt Service (Financed Mode)
  const loanAmount = data.askingPrice * (1 - loanTerms.down);
  const mRate = loanTerms.rate / 12;
  const mPay = (loanAmount * mRate) / (1 - Math.pow(1 + mRate, -loanTerms.years * 12));
  const annualDebt = mPay * 12;
  
  const cashFlow = noi - annualDebt;
  const coc = (cashFlow / (data.askingPrice * loanTerms.down)) * 100;

  return { noi, capRate, coc, maxOffer: noi / 0.07 };
};
4. The "Magic" CSS (src/index.css)

Include this block at the bottom of the implementation plan so the bot knows to write it.

CSS
@media print {
  .no-print { display: none !important; }
  body { background: white; font-family: 'Inter', sans-serif; }
  .printable-card { 
    visibility: visible; 
    position: absolute; 
    top: 0; left: 0; width: 100%; 
    border: 2px solid #000; padding: 20px;
  }
}
5. AI Extraction Prompt (lib/gemini.js)

JavaScript
const EXTRACTION_PROMPT = `
Act as a Senior RE Analyst. Extract: address, units, askingPrice, grossRent, propertyTaxes, insurance, utilities.
If a value is missing, use market averages for a multi-family property and add the field name to an 'estimates' array.
Output ONLY JSON.
`;