# Round 14.7 voice samples

Twenty Ask-style outputs across the launch archetypes, generated live through the providers whose keys are configured, using the canonical voice block from lib/voice/oria-voice.ts. Read each answer against docs/voice/oria-voice.md.

Generated live on: Anthropic, OpenAI.
Flagged, no key in env so live output not verified: Gemini.

Each sample below ran the same system prompt (the shared voice plus a minimal Ask framing) and the same question on every live provider, so the answers are directly comparable for cross-provider voice parity. Every answer was scanned for banned phrases; any hit is noted inline.

## 1. Personal | single lookup | lang en

Q: When does my passport expire?

Sources:
```
[1] Record: "US Passport" · Documents · expires 2028-09-14, issued 2018-09-15
```

A (Anthropic claude-haiku-4-5-20251001):
Your passport expires on September 14, 2028.

A (OpenAI gpt-4o-mini):
Your passport expires on September 14, 2028.

## 2. Personal | roll-up | lang en

Q: How much did I spend on groceries this month?

Sources:
```
[1] Whole Foods receipt · 2026-06-02 · $84.20
[2] Trader Joe's receipt · 2026-06-09 · $61.75
[3] Whole Foods receipt · 2026-06-17 · $112.40
[4] Costco receipt · 2026-06-24 · $208.10 (groceries + household)
```

A (Anthropic claude-haiku-4-5-20251001):
You spent $466.45 on groceries in June across 4 trips: Whole Foods on the 2nd ($84.20), Trader Joe's on the 9th ($61.75), Whole Foods on the 17th ($112.40), and Costco on the 24th ($208.10).

Note that the Costco charge includes household items mixed in, so the actual grocery portion is likely lower than $208.10.

A (OpenAI gpt-4o-mini):
You spent $84.20 at Whole Foods on June 2, $61.75 at Trader Joe's on June 9, $112.40 at Whole Foods on June 17, and $208.10 at Costco on June 24. 

Your total grocery spending for the month is $466.45.

## 3. Personal | what's coming up | lang en

Q: What's on this week?

Sources:
```
[1] Calendar: Dentist, Thu 2026-06-11 14:00
[2] Reminder: Car registration renews 2026-06-13
[3] Calendar: Dinner with Priya, Fri 2026-06-12 19:30
```

A (Anthropic claude-haiku-4-5-20251001):
You have a dentist appointment Thursday at 2 PM on the 11th, dinner with Priya Friday at 7:30 PM on the 12th, and your car registration renews Saturday the 13th.

A (OpenAI gpt-4o-mini):
You have a dentist appointment on Thursday, June 11, 2026, at 14:00. You have dinner with Priya on Friday, June 12, 2026, at 19:30. Your car registration renews on June 13, 2026.

## 4. Personal | honest limit (no source) | lang en

Q: How much did I spend on gas this month?

Sources:
```
(no sources matched the question)
```

A (Anthropic claude-haiku-4-5-20251001):
I don't have access to your gas purchases or spending records. To answer this, I'd need your credit card statements, bank transactions, or receipts from gas stations you visited this month.

A (OpenAI gpt-4o-mini):
I can't find that information. You need to add your gas expenses to your files or reminders for tracking.

## 5. Personal | distress | lang en

Q: my dad died this morning. i can't deal with any of this right now.

Sources:
```
[1] Reminder: Call accountant about Q2 (due today)
```

A (Anthropic claude-haiku-4-5-20251001):
I'm so sorry.

You don't have to deal with anything today. The reminder about your accountant can wait.

Is there someone with you right now, or someone you want to call?

A (OpenAI gpt-4o-mini):
I'm sorry for your loss. You have a reminder to call your accountant about Q2, which is due today. You might want to postpone that call.

## 6. Investor | single lookup | lang en

Q: What's the carried interest on Fund III?

Sources:
```
[1] Record: "Fund III LPA" · carried interest 20% over an 8% preferred return
```

A (Anthropic claude-haiku-4-5-20251001):
The carried interest on Fund III is 20% over an 8% preferred return. [1]

A (OpenAI gpt-4o-mini):
The carried interest on Fund III is 20% over an 8% preferred return.

## 7. Investor | roll-up | lang en

Q: How much of my portfolio is in AI startups?

Sources:
```
[1] Holding: Anthropic, $250,000, sector AI
[2] Holding: Cursor, $120,000, sector AI
[3] Holding: Ramp, $90,000, sector fintech
[4] Holding: Whoop, $60,000, sector health
```

A (Anthropic claude-haiku-4-5-20251001):
$370,000 across Anthropic and Cursor, which is 65% of your $570,000 total portfolio.

A (OpenAI gpt-4o-mini):
Your portfolio has $370,000 invested in AI startups. This includes $250,000 in Anthropic and $120,000 in Cursor.

## 8. Investor | what to review | lang en

Q: Anything that needs attention on my deals?

Sources:
```
[1] Deal: Helix Bio, in diligence, data room access expires 2026-06-12
[2] Deal: Northwind, SAFE signature requested, awaiting countersign 6 days
[3] Deal: Lumen, term sheet sent, no response 11 days
```

A (Anthropic claude-haiku-4-5-20251001):
Northwind is waiting on your countersignature on the SAFE, due in 6 days. Lumen hasn't responded to the term sheet in 11 days, so a follow-up call makes sense. Helix Bio's data room access runs until mid-June 2026, so that's not urgent.

A (OpenAI gpt-4o-mini):
You need to follow up on the Northwind deal, as the SAFE signature is requested and you're awaiting countersign for 6 days. The Helix Bio data room access expires on June 12, 2026, so keep that in mind for future reference. The Lumen deal has had no response for 11 days after the term sheet was sent, which may require a follow-up as well.

## 9. Investor | hostile | lang en

Q: this is useless. stop wasting my time and just give me the number.

Sources:
```
[1] Holding: Anthropic, current mark $250,000, cost basis $100,000
```

A (Anthropic claude-haiku-4-5-20251001):
Your Anthropic holding is worth $250,000.

A (OpenAI gpt-4o-mini):
Your current mark for Anthropic is $250,000.

## 10. Business | single lookup | lang en

Q: When is the ConEd invoice due?

Sources:
```
[1] Upload: "ConEd May invoice" · amount $1,240.18 · due 2026-06-15
```

A (Anthropic claude-haiku-4-5-20251001):
The ConEd invoice is due on June 15, 2026.

A (OpenAI gpt-4o-mini):
The ConEd invoice is due on June 15, 2026.

## 11. Business | roll-up | lang en

Q: What are my recurring software expenses?

Sources:
```
[1] Trackable: Adobe CC, $59.99/mo
[2] Trackable: Notion, $16/mo
[3] Trackable: AWS, ~$430/mo
[4] Trackable: Figma, $45/mo
```

A (Anthropic claude-haiku-4-5-20251001):
Your recurring software expenses are:

Adobe CC $59.99/mo
Notion $16/mo
AWS ~$430/mo
Figma $45/mo

That's roughly $551/mo total.

A (OpenAI gpt-4o-mini):
Your recurring software expenses are:

Adobe CC, $59.99/mo  
Notion, $16/mo  
AWS, ~$430/mo  
Figma, $45/mo

## 12. Business | document action needed | lang en

Q: Is there anything I need to sign?

Sources:
```
[1] Upload: "Mutual NDA - Brightline" · status awaiting your signature · received 2026-06-08
```

A (Anthropic claude-haiku-4-5-20251001):
You have a mutual NDA from Brightline waiting for your signature. It came in on June 8th.

A (OpenAI gpt-4o-mini):
You need to sign the "Mutual NDA - Brightline," which is currently awaiting your signature.

## 13. Business | roll-up (French, tutoiement, EUR) | lang fr

Q: Combien j'ai facturé ce mois-ci?

Sources:
```
[1] Facture #2041 · client Maison Leduc · 3 200 EUR · 2026-06-04
[2] Facture #2042 · client Atelier Sud · 1 850 EUR · 2026-06-18
```

A (Anthropic claude-haiku-4-5-20251001):
Tu as facturé 5 050 EUR en juin: 3 200 EUR à Maison Leduc le 4 juin et 1 850 EUR à Atelier Sud le 18 juin.

A (OpenAI gpt-4o-mini):
Ce mois-ci, vous avez facturé 3 200 EUR à Maison Leduc et 1 850 EUR à Atelier Sud. Le total est de 5 050 EUR.

## 14. Family Office | single lookup | lang en

Q: When does the Aspen property insurance renew?

Sources:
```
[1] Record: "Aspen residence policy" · carrier Chubb · renews 2026-07-01 · premium $18,400/yr
```

A (Anthropic claude-haiku-4-5-20251001):
Your Aspen residence policy renews on July 1, 2026.

A (OpenAI gpt-4o-mini):
The Aspen property insurance renews on July 1, 2026.

## 15. Family Office | roll-up (multi-currency) | lang en

Q: What's the total across the three trusts?

Sources:
```
[1] Trust: Marin Family Trust, $4,200,000
[2] Trust: Geneva Holdings Trust, 1,900,000 EUR
[3] Trust: Children's Education Trust, $850,000
```

A (Anthropic claude-haiku-4-5-20251001):
The three trusts total $5,950,000 USD plus 1,900,000 EUR.

The dollar trusts are Marin Family Trust at $4,200,000 and Children's Education Trust at $850,000. The Geneva Holdings Trust is denominated in euros, so I can't combine it with the others without a current exchange rate.

A (OpenAI gpt-4o-mini):
The total across the three trusts is $6,950,000.

## 16. Family Office | what to review | lang en

Q: What needs my attention across the family entities?

Sources:
```
[1] Marin Family Trust: K-1 not yet received from accountant
[2] Geneva Holdings: wire of 250,000 EUR pending approval
[3] Aspen residence policy renews 2026-07-01
```

A (Anthropic claude-haiku-4-5-20251001):
The K-1 from your accountant for the Marin Family Trust hasn't arrived yet. You have a 250,000 EUR wire pending approval at Geneva Holdings. Your Aspen residence policy renews July 1, 2026.

A (OpenAI gpt-4o-mini):
You need to follow up on the K-1 from the accountant for the Marin Family Trust. You also need to approve the pending wire of 250,000 EUR for Geneva Holdings. The Aspen residence policy is set to renew on July 1, 2026, which may require attention closer to that date.

## 17. Family Office | single lookup (Arabic, MSA, RTL) | lang ar

Q: متى تنتهي صلاحية جواز سفر ابنتي؟

Sources:
```
[1] سجل: "جواز سفر ليلى" · تنتهي الصلاحية 2027-03-22
```

A (Anthropic claude-haiku-4-5-20251001):
صلاحية جواز سفر ليلى تنتهي في 22 مارس 2027.

A (OpenAI gpt-4o-mini):
تنتهي صلاحية جواز سفر ليلى في 22 مارس 2027.

## 18. Personal | single lookup (Spanish, tuteo) | lang es

Q: ¿Cuándo es el cumpleaños de mi mamá?

Sources:
```
[1] Nota: "Cumpleaños de mamá" · 14 de agosto
```

A (Anthropic claude-haiku-4-5-20251001):
El cumpleaños de tu mamá es el 14 de agosto.

A (OpenAI gpt-4o-mini):
El cumpleaños de tu mamá es el 14 de agosto.

## 19. Personal | casual greeting | lang en

Q: morning

Sources:
```
[1] Calendar: Standup 10:00
[2] Reminder: AmEx autopays $1,240 at 09:00
```

A (Anthropic claude-haiku-4-5-20251001):
You have a standup at 10:00 and an AmEx autopay of $1,240 hitting at 09:00.

A (OpenAI gpt-4o-mini):
You have a standup at 10:00. Your AmEx autopay of $1,240 is scheduled for 09:00.

## 20. Investor | roll-up (currency split) | lang en

Q: What did I wire last quarter?

Sources:
```
[1] Wire: $500,000 to Helix Bio SPV · 2026-04-10
[2] Wire: 300,000 EUR to Northwind · 2026-05-02
[3] Wire: $150,000 to Lumen bridge · 2026-05-28
```

A (Anthropic claude-haiku-4-5-20251001):
I don't have a clear record of which quarter you mean. The wires I see are all dated in 2026 (April through May), but I'd need to know your fiscal year to say which quarter that falls in.

What I can tell you: you wired $500,000 to Helix Bio SPV on April 10, 300,000 EUR to Northwind on May 2, and $150,000 to Lumen bridge on May 28.

A (OpenAI gpt-4o-mini):
You wired $500,000 to Helix Bio SPV on April 10, 2026, and 300,000 EUR to Northwind on May 2, 2026.

---

Total banned-phrase hits across all live outputs: 0.

