Requirement: Client wants to create login sequence on the Target__c object.

Client is suggesting to create 4 fields:
1. Sequence Active (checkbox) -- Kill switch default to true — all three flows check this. Flow 3 auto-unchecks when Status changes to a terminal value. Reps can uncheck manually at any time.
2. Sequence Step(Number 2,0) -- Counter tracking which step the Lead is on. Flows 1 and 2 both read and write this. Values 0-10.
3. Days Until Next Email (Number 3, 0) -- 4 as default and Configurable wait between call completion and next email. Can be adjusted per-lead or via default. Flow 2 reads this field.
4. Sequence Stop Reason (Text 255) -- Optional. Sequence 3 writes the reason the sequence was auto-stopped (e.g., "Converted", "Do Not Contact"). Useful for reporting.


Feature 1:
- Fires when Target is created
- Sends Email 1 immediately and creates Call 1 task (due + 2 days) 
- Logs Email 1 as completed task activity 
- Sets Sequence Step = 1 
- Checks kill switch before send if it is false we should not send nothing

Feature 2:
- Fires When " Call 1" task created by Feature 1 is marked Complete
- Reads Target current Sequence Step = 1
- Waits 4 days (default 4) and checks kill switch
- Sends email 2, creates Call 2 task (due + 2 days), logs Email 2 as completed task activity 
- Update Sequence Step = 2

Feature 3:
- Fires When " Call 2" task created by Feature 2 is marked Complete
- Reads Target current Sequence Step = 2
- Waits 4 days (default 4) and checks kill switch
- Sends email 3, creates Call 3 task (due + 2 days), logs Email 3 as completed task activity 
- Update Sequence Step = 3

Feature 4:
- Fires When " Call 3" task created by Feature 3 is marked Complete
- Reads Target current Sequence Step = 3
- Waits 4 days (default 4) and checks kill switch
- Sends email 4, creates Call 4 task (due + 2 days), logs Email 4 as completed task activity 
- Update Sequence Step = 4

Feature 5:
- Fires When " Call 4" task created by Feature 4 is marked Complete
- Reads Target current Sequence Step = 4
- Waits 4 days (default 4) and checks kill switch
- Sends email 5, creates Call 5 task (due + 2 days), logs Email 5 as completed task activity 
- Update Sequence Step = 5

Feature 6:
- Fires When " Call 5" task created by Feature 5 is marked Complete
- Reads Target current Sequence Step = 5
- Waits 4 days (default 4) and checks kill switch
- Sends email 6, creates Call 6 task (due + 2 days), logs Email 6 as completed task activity 
- Update Sequence Step = 6

Feature 7:
- Fires 14 days after Update Sequence Step was updated as 6 
- checks kill switch
- Sends email 7, creates Call 7 task (due + 2 days), logs Email 7 as completed task activity 
- Update Sequence Step = 7

Feature 8:
- Fires 7 days after Update Sequence Step was updated as 7
- checks kill switch
- Sends email 8, creates Call 8 task (due + 2 days), logs Email 8 as completed task activity 
- Update Sequence Step = 8

Feature 9:
- Fires 14 days after Update Sequence Step was updated as 8
- checks kill switch
- Sends email 9, creates Call 9 task (due + 2 days), logs Email 9 as completed task activity 
- Update Sequence Step = 9

Feature 10:
- Fires 14 days after Update Sequence Step was updated as 9
- checks kill switch
- Sends email 10, creates Call 10 task (due + 2 days), logs Email 10 as completed task activity 
- Update Sequence Step = 10

Feature 11:
- Fires when Status__c field is updated in the target__c record and Sequence Active is true
- if status = 'converted' or status = ' Meeting Booked' or status = 'Do not Contact' or status = 'Replied' -> update  Sequence Active to false and update the Sequence Stop Reason field to write the reason the sequence was auto-stopped 

Feature 12:
- LWC in target record page to upload one file and that file will be attached on all the emails, it can just contain one file, if not files is included the email will be send whitout file attached
# Email templates:

After email 1, all emails after should be “replies” from the one sent prior. That’s why all the subject lines from email 2-10 start with “RE:”.
## Email 1:
Subject Line: Interest in **[Target Name]**

Hi **[Primary Contact ]**,

Hope all is well and the business is off to a strong start.

I’m following up on a recent mailer we sent (attached) regarding a compelling opportunity with our client Atrium Home Services, a people-first, fast-growing residential HVAC, plumbing, and electrical services company with a strong Midwest footprint.

Atrium is actively seeking to partner with top residential service providers as part of its strategic growth efforts. As their exclusive buy-side advisor, we’re reaching out to owners who may be open to exploring a value-driven, flexible partnership.

_What sets Atrium apart_:

●        A strong, people-centric culture with a proven partnership record

●        Flexible, lucrative deal structures – **all cash up front**, equity roll, and continued leadership involvement

●        **Preservation of brand, legacy, and people**

Additionally, my firm’s founder has over a decade of experience working with strategic acquirers such as **_Apex_**, **_Heartland_**, **_Sila_**, **_Turnpoint_**, **_ARS_**, etc., and we believe Atrium is setting a new standard in the market.

Would you be open to a brief 10-minute call to discuss it further?

Best Regards,
## Email 2:
Subject Line: RE: Interest in **[Target Name]**

**[Primary Contact ]**,

Following up on the opportunity I shared (attached) regarding our client, Atrium Home Services.

We completely understand and respect your position as you work toward your multi-year goals and/or succession planning efforts. Atrium places a strong emphasis on relationship building, ensuring **both parties share similar values, goals, and cultural alignment**.

With flexible, value-driven deal structures, whether all cash at close, equity participation, or continued involvement—Atrium is committed to creating win-win partnerships. _With Atrium, the strongest outcomes happen when owners start planning early, long before they’re ready to step back so the transition happens on their terms_.

I look forward to hearing from you.

Thank You,
## Email 3:
Subject Line: RE: Interest in **[Target Name]**

**[Primary Contact ]**,

Atrium has taken a hard look at what you’ve built, and this isn’t casual interest. They view **[Target Name]** as a top-tier platform in **[Billing City]** — leadership-driven, brand-forward, and scaled the right way.

**You’ve been around this market long enough to know the difference between groups that talk a good game and those that “actually” transact, support operators, and honor what made the business successful in the first place**. Atrium is firmly in the latter camp — flexible on structure, thoughtful on valuation, and people-first post-close.

If you’re even open to understanding what a real, no-pressure conversation could look like, I believe a short call would be worth your time. Look forward to hearing from you.

Regards,

## Email 4:
Subject Line: RE: Interest in **[Target Name]**

Hi **[Primary Contact]**,

Touching base on my client, Atrium Home Services (overview attached).

They’re not some big corporate outfit looking to slap their name on your trucks or tell you how to run your crew. They partner with **values-driven** HVAC, plumbing, and electrical companies that have good people, strong reputations, and room to grow.

Atrium keeps it simple — _they help with training and recruiting, back-office support, buying power, and resources so owners can take some chips off the table or just have more breathing room without giving up everything or damaging legacy_.

If you’ve ever thought about growth, access to additional resources, partnership, or maybe just less day-to-day grind, a quick call would be worthwhile.

What’s the best way to reach you?

All the Best,

## Email 5:
Subject Line: RE: Interest in **[Target Name]**

**[Primary Contact]**,

Most of the conversations I have with owners aren’t centered around selling — they’re about understanding what’s happening in the market, how different groups operate, how they structure partnerships, and what options actually look like with the right group.

Atrium is a prime example — **large enough to serve, but still small enough to care**. They’re not trying to roll up the country overnight, but instead growing deliberately, focused on the right partners and geographies, while giving owners access to better buying power, marketing, and infrastructure without changing what you’ve created.

_We’re looking to build more than just deals — we’re looking to build long-term prosperity_. Given what you’ve built, I’d value your perspective and the opportunity to connect at your convenience.

Thank You,

## Email 6:
Subject Line: RE: Interest in **[Target Name]**

Hi **[Primary Contact]**,

Rather than tell you what Atrium says about itself, I’d rather show you what their partners say.

Bob and Tom Hedlund (Hedlund Plumbing, an 85-year-old family business in Central Michigan) joined Atrium in June 2022. They still run the Lansing location today with their original leaders and technicians. Since partnering, the business has grown 125%+ — roughly a 26% CAGR — by adding HVAC and electrical to their existing plumbing and sewer offerings, with corporate support handling accounting, HR, marketing, and IT.

Josh Bigelow (Great Dane Heating & Air, Eastern Michigan) joined in November 2022. He still runs both locations alongside his original leadership and finance team. The business is up 55%+ since closing, with a brand-new greenfield location in Farmington Hills.

**_Both owners stayed. Both teams stayed. Both brands stayed_**_._ That’s the partnership model, not a roll-up that strips identity for synergies.

Happy to put you in touch with either of them directly if that would be helpful. Otherwise, a brief 10-minute call would let me share more of what makes this group different.

Regards

## Email 7:
Subject Line: RE: Interest in **[Target Name]**

**[Primary Contact]**,

In most of my conversations with owners, the financial side gets sorted out quickly. The harder questions are the human ones — _What happens to my team? Does my name come off the truck? Does the next owner of my home call a stranger or someone who knows them?_

Atrium’s answer is consistent across every partnership they’ve done:

**Brand stays**. The name you built equity in over decades doesn’t get repainted.

Service Professor is still Service Professor. Anderson is still Anderson. Anton’s is still Anton’s.

**Leadership stays**. Original owners and their teams continue running the business. Atrium provides corporate support across accounting, HR, marketing, call center, and technology so leaders can focus on their customers and crews.

**People grow**. Through Atrium University, technicians and leaders get access to trade certifications, leadership development, and career paths that most independent shops simply can’t offer on their own.

If preserving what you’ve built matters as much as the check at close, this is a conversation worth having. What does your week look like?

All the Best,

## Email 8:
Subject Line: RE: Interest in **[Target Name]**

Hi **[Primary Contact]**,

Following up on my note about Atrium. To clarify upfront: this isn’t a pitch to sell, and there’s no formal process running. We reach out to a small number of operators each year for exploratory conversations — most don’t lead anywhere immediately, and that’s fine.

If a 15-minute call to understand what a partnership _could_ look like (structure, valuation framework, your role afterward) is useful as a benchmark, I’m happy to set it up. If not, just say so and I’ll move on.

Thanks,

## Email 9:
Subject Line: RE: Interest in **[Target Name]**

**[Primary Contact]**,

A quick observation from the field: the residential HVAC, plumbing, and electrical M&A market has matured significantly over the last 24–36 months. Multiples for top-tier platforms remain strong, but buyer behavior is becoming more selective — groups are moving deeper into diligence, structuring more conservatively, and **rewarding the operators who came to the table _before_ they had to**.

That’s the part most owners don’t hear until it’s too late. _The strongest outcomes both economically and personally happen when owners explore options on the front foot, not the back foot_. **You hold the leverage when you don’t need the deal**.

Even if a transaction is two, three, or five years away, knowing what a partnership with Atrium would actually look like — structure, valuation range, role post-close — gives you a benchmark to plan against. _No pressure, no obligation, no formal process._

Worth a 10-minute call to map it out?

Regards,

## Email 10:
Subject Line: RE: Interest in **[Target Name]**

Hi **[Primary Contact]**,

This is the last note from me on this. I’ve reached out a few times about Atrium and don’t want to keep showing up in your inbox if there’s nothing here for you.

Three possibilities:

1. _Wrong time._ Reply with a date and I’ll circle back then.

2. _Interested but slammed._ Reply "yes" and I’ll send a 15-minute calendar link.

3. _Not for me._ Reply "no" and I close the file. No follow-up.

Wishing you all the best.

Thank You,