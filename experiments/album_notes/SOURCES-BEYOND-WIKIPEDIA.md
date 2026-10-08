# Album notes for albums with no Wikipedia article: which other sources may an LLM pipeline read for facts?

Research date: 2026-10-08. Builds on `experiments/album_notes/SOURCES.md` (Wikipedia, Wikidata, MusicBrainz, Discogs, Last.fm, AllMusic, Apple, Spotify, Genius, RYM, critics, Bandcamp at a high level). This file does not repeat those findings.

Scope: about 2,100 of 10,467 albums (20%) have no Wikipedia article. Proposed pipeline: an LLM with web search runs offline, perhaps once, reads pages about each album, writes a short ORIGINAL line plus 100 to 200 words of notes in its own words, states only facts (who, where, when, how it was made, the idea behind it), links every source, quotes nothing. The site is free today and may carry ads or a paid tier later; its repository is public, so everything committed is also redistributed.

This is a reading of terms, statutes and decisions, not legal advice. **Read today** means I fetched the primary page on 2026-10-08. **Archived** means I read a Wayback Machine snapshot because the live page blocked automated fetches. **Secondhand** means I relied on reporting or commentary and did not read the primary text.

---

## Verdicts at a glance

| Source type | Read by a human (via a search engine) | Automated or LLM-agent reading | Verdict |
|---|---|---|---|
| Artist's or label's own website (bio, news, release page, press release) | Yes | Yes, if robots.txt and AI signals allow | **Use first** (facts, link) |
| Text the artist or label sends with written permission | n/a | n/a | **Use** (may quote or adapt) |
| Webzine and blog reviews, interviews, features | Yes | Only where robots.txt admits the agent and there is no `ai-input=no`, `use=immediate` or TDM reservation | **Facts only, with conditions** |
| Encyclopaedia Metallum | Yes | Yes, slowly (robots allows release pages, `Crawl-delay: 3`); no terms of use found | **Facts only** (line-ups, dates, studio, label), never review or notes text |
| YouTube descriptions | Personal viewing only | Only through the YouTube Data API, never scraping | **Facts only, via API**, low value |
| Bandcamp album "about" text, Bandcamp Daily | Low risk for a person noting a fact, but strictly outside the licence | **No**: the Acceptable Use Policy bans scraping, text and data mining and feeding content into an AI model | **Don't feed to the pipeline**; link, and ask artists for their text directly |
| Reddit threads | Personal use only | **No**: robots.txt disallows everything, scraping needs written consent, API needs a deal for commercial use | **Don't use**; at most a human lead to a primary source |
| Sites that block user-triggered AI fetchers (e.g. Pitchfork, The Wire block `Claude-User`) | Yes, link out | **No** | **Link only** |
| Anything behind a login, paywall or bot challenge | | **Never circumvent** | **Skip** |

---

## 1. Copyright: restating facts from copyrighted pages

### 1.1 United States

**Idea and expression.** 17 U.S.C. §102(b) (read today, https://www.law.cornell.edu/uscode/text/17/102):

> "In no case does copyright protection for an original work of authorship extend to any idea, procedure, process, system, method of operation, concept, principle, or discovery, regardless of the form in which it is described, explained, illustrated, or embodied in such work."

*Feist Publications v. Rural Telephone*, 499 U.S. 340 (1991) (read today, https://www.law.cornell.edu/supremecourt/text/499/340):

> "No one may claim originality as to facts."
> "the copyright in a factual compilation is thin. Notwithstanding a valid copyright, a subsequent compiler remains free to use the facts contained in another's publication to aid in preparing a competing work, so long as the competing work does not feature the same selection and arrangement."
> "[T]he very same facts and ideas may be divorced from the context imposed by the author, and restated or reshuffled by second comers, even if the author was the first to discover the facts or to propose the ideas." (quoting Ginsburg)
> "the raw facts may be copied at will."

So "recorded in 2019 at a farmhouse studio in Vermont, produced by X, written after the drummer left" may be taken from a review or interview and restated. What is protected: the wording, distinctive metaphors, the critic's evaluative prose, and in a compilation the original **selection and arrangement**. A crediting link does not change the infringement analysis either way. It is good practice and good for accuracy, but it is not a licence.

**Close paraphrase is the real risk.** Courts compare "total concept and feel" and non-literal similarity, not just identical strings:
- *Nihon Keizai Shimbun v. Comline Business Data*, 166 F.3d 65 (2d Cir. 1999): abstracts of news articles infringed where they tracked the originals' sentences and organisation closely, even though the facts themselves were free. Fair use failed: not transformative, and the abstracts substituted for the articles. Secondhand, via the Copyright Office fair-use summary: https://www.copyright.gov/fair-use/summaries/nihonkeizai-comline-2ndcir1999.pdf
- *Advance Local Media v. Cohere*, No. 1:25-cv-01305 (S.D.N.Y., 13 Nov 2025): the court refused to dismiss a direct-infringement claim built on an LLM's "substitutive summaries" of news articles. It said the outputs went beyond shared facts ("a mix of verbatim copying and close paraphrasing") and that whether the copying was too minimal to infringe was a question for a jury. This is a pleading-stage ruling and decides nothing on the merits. Secondhand: https://law.justia.com/cases/federal/district-courts/new-york/nysdce/1:2025cv01305/636920/59/ and commentary at https://www.loeb.com/en/insights/publications/2025/11/advanced-local-media-llc--v-cohere-inc
- Lesson for the pipeline: a one-source LLM "rewrite" that keeps the source's order, sentence by sentence, is the pattern that gets litigated. A short text built from several sources, facts only, in the site's own order, is not.

**"Hot news" misappropriation.** It survives only in a narrow form. *NBA v. Motorola*, 105 F.3d 841 (2d Cir. 1997) requires time-sensitive factual information gathered at a cost, free-riding, direct competition, and a threat to the plaintiff's very existence or quality. *Barclays Capital v. Theflyonthewall.com*, 650 F.3d 876 (2d Cir. 2011) held such a claim preempted where the defendant merely reported facts the plaintiff had made news of. Secondhand summaries: https://fairuse.stanford.edu/case/barclays-capital-inc-et-al-v-theflyonthewall-com-inc , https://www.dmlp.org/blog/2011/second-circuit-rules-hot-news-claims-preempted . **Not a real risk here.** Background on an album released years ago is not time-sensitive, and an album-recommendation site does not compete with a webzine's news service.

**Contract claims are separate from copyright.** Copyright lets you restate facts. A site's terms may still try to forbid it, and whether those terms bind you is a separate question. US courts are split on whether such claims survive:
- *X Corp. v. Bright Data* (N.D. Cal. May 2024, Alsup J.): X's anti-scraping contract claims over public posts were preempted by the Copyright Act. Secondhand: https://blog.ericgoldman.org/archives/2024/05/x-corp-v-bright-data-is-the-decision-weve-been-waiting-for-guest-blog-post.htm
- *Meta v. Bright Data* (N.D. Cal. Jan 2024): logged-out scraping was outside Meta's terms. Secondhand.
- *Reddit v. Anthropic* (N.D. Cal. remand order, 30 March 2026): the User Agreement's limits on commercial scraping were held "qualitatively different" from copyright, so not preempted, and the case went back to San Francisco Superior Court, where it is still pending. Secondhand: https://www.crowell.com/en/insights/client-alerts/northern-district-of-california-court-holds-state-tort-and-contract-claims-not-preempted-by-federal-copyright-act-remands-reddit-v-anthropic-to-state-court
- *Reddit v. SerpApi, Perplexity et al.* (S.D.N.Y., ruling of 31 July 2026): claims under the anti-circumvention provisions of the DMCA (17 U.S.C. §1201) and for civil conspiracy survive a motion to dismiss. Reddit alleges its posts were scraped from Google results by circumventing Google's anti-bot system. Secondhand: https://www.mediapost.com/publications/article/416950/reddit-can-proceed-with-scraping-claims-against-pe.html . Lesson: **never get past a bot challenge, login or paywall.**

### 1.2 European Union

**Copyright.** EU law protects a work only as "the author's own intellectual creation". Facts are not protected, but small amounts of wording can be. *Infopaq* (C-5/08, 2009) held that 11 consecutive words can be a reproduction "in part" if they express the author's creativity (from memory, not re-read today). Germany's Federal Court of Justice, in *Perlentaucher* (I ZR 12/08, 2010), held that abstracts of newspaper book reviews are lawful if they are independent works, but not where they take over the original's characteristic formulations (from memory, not re-read today). The practical line is the same as in the US: facts free, phrasing and structure not.

**Press publishers' right** (DSM Directive 2019/790, Art. 15). Read today through the legislation.gov.uk copy of the text as adopted, https://www.legislation.gov.uk/eudr/2019/790/article/15 (EUR-Lex blocked automated fetches: https://eur-lex.europa.eu/eli/dir/2019/790/oj). The right covers online use of EU publishers' press publications by "information society service providers" (which a website is), for two years after publication. It "shall not apply to acts of hyperlinking" or to "the use of individual words or very short extracts". Recital 57: the rights "should also not extend to mere facts reported in press publications." **Facts plus a link fall outside this right.** Some webzines may count as press publications (there must be editorial responsibility), but that does not matter for a facts-only text.

**Database right (sui generis)**, Directive 96/9/EC (read today via https://www.legislation.gov.uk/eudr/1996/9/article/7 ; canonical text https://eur-lex.europa.eu/eli/dir/1996/9/oj):
- Art. 7(1): the maker of a database with "a substantial investment in either the obtaining, verification or presentation of the contents" may prevent "extraction and/or re-utilization of the whole or of a substantial part" of its contents.
- Art. 7(2)(a): "'extraction' shall mean the permanent or temporary transfer of all or a substantial part of the contents of a database to another medium by any means or in any form".
- Art. 7(5): "The repeated and systematic extraction and/or re-utilization of insubstantial parts of the contents of the database implying acts which conflict with a normal exploitation of that database or which unreasonably prejudice the legitimate interests of the maker of the database shall not be permitted."
- Art. 8(1): a lawful user may extract "insubstantial parts of its contents ... for any purposes whatsoever".
- Art. 11(1): the right applies only to databases "whose makers or rightholders are nationals of a Member State or who have their habitual residence in the territory of the Community" (11(2): or companies with their registered office, central administration or principal place of business there).
- The CJEU in *CV-Online Latvia v Melons* (C-762/19, 3 June 2021) made infringement turn on whether the copying puts at risk the maker's investment in obtaining, verifying or presenting the data. Secondhand: https://www.scl.org/12290-cjeu-search-engine-copying-of-databases-infringes-sui-generis-right-where-it-adversely-affects-database-maker-investment/

Applied to the sources here:
- **Discogs** (US company) and **Encyclopaedia Metallum** (founded in 2002 by a Montreal couple, per Wikipedia; the site does not say who runs it today) most likely fall **outside Art. 11**, so there is no EU database right to infringe. US and Canadian law protect only original selection and arrangement (*Feist*). Discogs' dumps are CC0 anyway (SOURCES.md §4).
- A webzine's archive of reviews is a collection of articles. Its investment is in *creating* content, which the CJEU does not count (*British Horseracing Board v William Hill*, C-203/02, from memory). Taking a few facts from a few articles is far from a "substantial part".
- Practical guard: do not pull the same fields for hundreds of albums from one database and republish them as a set (for example, full Metallum line-ups for every metal album). That is the Art. 7(5) pattern. Take what an individual note needs, link the entry, and prefer CC0 sources (Wikidata, MusicBrainz, Discogs dumps) for structured fields.

**Text and data mining exception** (DSM Art. 3 and 4): see section 3.

### 1.3 What keeps it safe in practice

1. **A clean-room, two-step design.** Step A, the extractor, reads a page and outputs only atomic facts: `{fact, source_url, retrieved_at}`, each at most about 15 words, normalised (`recorded_at: <studio>, <city>, 2019`), no adjectives, no opinions, no sentences copied. Step B, the writer, sees **only the fact table**, never the page text, and writes the line and the notes in the site's voice. The writer cannot paraphrase wording it never saw. This is the strongest single safeguard.
2. **Facts, not judgments.** Leave out the critic's evaluations ("a crushing, glacial masterpiece"). Those are the expressive core of a review, and restating them is what makes a summary a substitute for it. Where the "idea behind it" comes from an artist interview, attribute it ("the band has said the record is about ...") and keep it to a clause.
3. **Several sources where possible.** Sort facts by the site's own template order (who, when, where, how, idea), not the source's order. If only one source exists, write less: one or two sentences plus the link, not 200 words that retell that one article.
4. **Overlap check against every source fetched for that album.** Before publishing, lower-case, strip punctuation and mask proper names and titles. Then reject the text if it shares any **8-word sequence** with a source, if more than about **5% of its 5-grams** appear in any one source, or if it has a shared character run of **over 40 characters**. Also flag texts whose sentence order aligns with one source's paragraph order (embedding alignment, or a longest-common-subsequence ratio over about 0.3). These thresholds are engineering choices, not legal tests; they are tighter than anything a court has required.
5. **Short.** The 1-line plus 100 to 200 words proposal is fine when the facts come from several sources. Keep the short line to 25 words or fewer.
6. **No quotes at all** in automated output. A short attributed quote can be lawful (US fair use; EU quotation exception, InfoSoc Art. 5(3)(d)), but it is a judgement call, not something to automate across 2,000 pages.
7. **Raw pages stay private and temporary.** Keep fetched HTML in a private cache only as long as extraction and the overlap check need it (DSM Art. 4(2): copies "may be retained for as long as is necessary for the purposes of text and data mining"). Never commit them to the public repository; commit only facts, URLs and dates.
8. **Human spot check and a correction route.** Read about 5% of outputs against their sources. Put a "Something wrong or yours? Tell us" link on every note and honour takedowns quickly.
9. **Personal data.** Many metal and underground artists use pseudonyms. Do not publish real names, birthplaces or other private details unless the artist has published them; Metallum's own privacy page acknowledges such requests.

---

## 2. Terms of service, site by site

### 2.1 Reddit

Primary texts, read today:
- **User Agreement**, "Effective July 1, 2026. Last Revised May 26, 2026", https://www.redditinc.com/policies/user-agreement
  - §3: Reddit grants "a personal, non-transferable, non-exclusive, revocable, limited license to ... (b) access and use the Services." Without written agreement you may not "license, sell, transfer, assign, distribute, host, or otherwise commercially exploit the Services or Content" or "access the Services or Content in order to build a similar or competitive website, product, or service".
  - §7: you may not "Access, search, or collect data from the Services by any means (automated or otherwise) except as permitted in these Terms or in a separate agreement with Reddit (we conditionally grant permission to crawl the Services in accordance with the parameters set forth in our robots.txt file, but scraping the Services without Reddit's prior written consent is prohibited)".
  - §5: users "retain any ownership rights" in their posts and license them to Reddit, "including the right to use Your Content to train AI and machine learning models".
- **robots.txt** (read today, https://www.reddit.com/robots.txt): `User-agent: * / Disallow: /`, with the comment "Reddit believes in an open internet, but not the misuse of public content." So the "conditional permission to crawl" covers no one without a deal.
- **Public Content Policy** (archived snapshot of 5 Oct 2026; live page returns 403), https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy : "you can use Reddit content for non-commercial uses, such as learning and community, but talk to us if you have commercial purposes in mind." "We still believe in an open internet, but we do not believe that third parties have a right to misuse public content just because it's public." Licensees include "Large language model makers".
- **Data API Terms**, "Effective June 19, 2023. Last Revised July 20, 2026", https://redditinc.com/policies/data-api-terms : "If you are interested in using the Data APIs for commercial purposes ... you will need to enter into a separate agreement with Reddit." You may not "derive revenues from the use or provision of the Data APIs ... unless there is express written approval". The licence is to "copy and display the User Content ... solely as necessary to ... run your App", and "You may not modify the User Content except to format it for such display." No right to use User Content "for training a machine learning or AI model" without rightholders' permission. On termination, delete everything, "including any data or models that were derived from User Content".
- **Developer Terms**, "Effective September 24, 2024. Last Revised March 24, 2026", https://redditinc.com/policies/developer-terms , §4.1: you will not "access or use any of the Reddit Services and Data by or on behalf of a business or as part of a service or product that is monetized" or "derive revenues of any kind ... including from any data derived from the foregoing". §4.2: no use "(including by accessing our API or indexing, caching, or crawling ...) to train large language, artificial intelligence, or other algorithmic models or related services without our permission". §5.2: attribute with a link and the username, and delete data when the user deletes it.

**2023 to 2026 changes in short:** paid API and new Data API Terms (June 2023); Public Content Policy and robots.txt set to disallow all (May to June 2024); Developer Terms (Sept 2024, revised March 2026); suits against Anthropic (June 2025) and against SerpApi and Perplexity over content taken from Google results (Oct 2025, mostly surviving dismissal in July 2026); User Agreement revised May 2026 (AI training licence to Reddit spelled out).

**Answers:**
- *A person reading a thread to learn a fact:* within the personal licence. Writing that fact into a commercial site is not, in ordinary language, "commercially exploit[ing] ... Content", and the fact is not copyrightable. Reddit's stated position ("talk to us if you have commercial purposes in mind") is broader. Low legal risk, but unattractive.
- *An LLM agent or script fetching threads:* **prohibited** (§7 plus robots.txt). Anthropic's web fetch tool refuses URLs that robots.txt disallows (section 2.6), so it would not fetch them anyway.
- *Through the API:* commercial or monetised use needs a separate agreement (Data API Terms, Developer Terms §4.1), and the licence allows display, not modification or derivation. **Not usable** without a deal.
- *Through a search engine's results:* if the pipeline only sees a search provider's snippet of a Reddit page, it never uses Reddit's Services, so the User Agreement is hard to apply. The text is still the poster's (copyright: facts free). But Reddit is actively suing over the "via search engine" route, and its theory in the SerpApi case rests on circumventing Google's protections, which a licensed search API does not do. Even so, it is not worth the exposure.
- Also: Reddit posts are unsourced claims of uneven reliability.

**Verdict: don't use Reddit in the pipeline or as a cited source.** A person may use a thread as a *lead* (it points to an interview or a label page) and cite that primary source instead.

### 2.2 Bandcamp

- **Terms of Use**, "Effective Date: May 07, 2026" (archived snapshot of 4 Oct 2026; the live page serves a JavaScript challenge), https://bandcamp.com/terms_of_use :
  - "The Service (including, without limitation, any Content) is provided only for your own personal, non-commercial use".
  - "The term 'Content' includes, without limitation, any User Submissions, videos, audio clips, written forum comments, information, data, text, photographs ... generated, provided, or otherwise made accessible by Company or its partners on or through the Service."
  - "Company grants each user ... a ... license to use, modify and reproduce the Content, solely for personal, non-commercial use. Use, reproduction, modification, distribution or storage of any Content for other than personal, non-commercial use is expressly prohibited without prior written permission from Company, **or from the copyright holder identified in such Content's copyright notice**."
  - "By using the Site or Service in any manner, including but not limited to visiting or browsing the Site ... you agree to be bound".
- **Acceptable Use and Moderation Policy**, dated June 10, 2026, "incorporated within our Terms of Use" (read today), https://get.bandcamp.help/articles/15263124-bandcamp-s-acceptable-use-and-moderation-policy . You agree:
  - "Not to scrape any text, media, or other data or content from the site, including through the use of scripts, robots, bots, spiders, scrapers, crawlers, or other automated means;"
  - "Not to undertake any form of text and/or data mining of content, including where collected through the use of robots or other automated data gathering and/or extraction tools;"
  - "Not to train any machine learning or AI model using content on our site **or otherwise ingest any data or content from Bandcamp's platform into a machine learning or AI model**;"
- **robots.txt** (read today, https://bandcamp.com/robots.txt , same on daily.bandcamp.com): disallows `/search`, `/api/`, `/stream` etc. for all agents, and blocks **ClaudeBot, GPTBot, CCBot, Google-Extended, Bytespider, meta-externalagent, Amazonbot** entirely. It does **not** name `Claude-User`, `ChatGPT-User` or `Claude-SearchBot`. So robots.txt alone would let a user-triggered fetcher through, but the AUP forbids exactly this use. **Robots compliance is not terms compliance.**

**Do facts restated with a link fall under "use of Content"?** On the wording, yes: "Content" expressly includes "information" and "data", and the restriction covers any "use" other than personal and non-commercial. Copyright would not stop it, since facts are free, and whether a browsewrap clause binds a visitor depends on notice. Here the team now has actual knowledge, which strengthens enforceability, and US courts disagree on preemption (section 1.1). The AUP's "ingest ... into a machine learning or AI model" clause settles it for the pipeline: an LLM reading a Bandcamp page **is** that act.

**Bandcamp Daily** is Bandcamp's own editorial (Company Content) under the same Terms and AUP. Link to it; do not feed it to the pipeline.

**Verdict:** a person noting one fact from an album page is low risk but strictly outside the licence. **Automated or LLM reading: no.** Link the Bandcamp page (Wikidata P11354, MusicBrainz URL relationships). The useful opening is the Terms' own alternative: permission "from the copyright holder", which is the artist. Have artists send their text **directly** (email or a form on recmyrecord), so nothing is taken from Bandcamp's platform (section 4.4).

### 2.3 Encyclopaedia Metallum (metal-archives.com)

- **No terms of use page exists.** The footer links FAQ, Rules, Privacy Policy, Support, Tools; all read today.
- **robots.txt** (read today): `User-agent: *` disallows only `/affiliate/`, `/history/`, `/report/`, `/forum/`, `/users/`, with **`Crawl-delay: 3`**. It blocks only dotbot and SemrushBot. Band, album and label pages are open to crawling.
- **FAQ** (read today, https://www.metal-archives.com/content/faq), answering bands that ask to be removed: "There is no copyright on publicly available information, and that's all we're reprinting." The site itself takes the facts-are-free position.
- **Rules** (read today, https://www.metal-archives.com/content/rules): "Any text submitted to the site, such as a review, band biography, etc., must be in your own words. Do not copy text that someone else has written for another site or publication." Reviews: "Don't copy over someone else's review from another site ... Only the original author is allowed to do that." So reviews and biographies are the contributors' own copyrighted text.
- **Privacy policy** (read today, https://www.metal-archives.com/content/pp): it documents "information on the artists, labels, and organizations", will pseudonymize on reasonable request, and removes photos on request.
- **No official API.** Unofficial wrappers exist (python-metallum, enmet); I found no stated scraping policy, staff statement or ban, so I could not confirm the community norm either way. The site is non-commercial and ad-free per Wikipedia, which makes heavy automated use a goodwill issue.
- **Database right:** probably not applicable (Canadian makers, Art. 11); see section 1.2.

**Verdict: facts only.** Take line-up, recording dates, studio, label and format from release pages, at most one request every 3 seconds, with an identifying User-Agent and contact address, and only for albums that lack a better source. Never take review text, band "additional notes" or biographies. Link the entry (Wikidata P2721) in the credits. Do not republish full line-ups as a dataset.

### 2.4 Typical webzines, blogs, label pages and press releases

**robots.txt sample (read today, 32 music sites):**

| Site | Blocks `ClaudeBot` (training) | Blocks `Claude-User` / `Claude-SearchBot` (retrieval) | Other AI blocks / signals |
|---|---|---|---|
| pitchfork.com | yes | **yes** | also cohere, PerplexityBot, CCBot, Google-Extended |
| thewire.co.uk | yes | **yes** | ChatGPT-User, GPTBot, CCBot, Amzn-User |
| nme.com | yes (and Claude-Web) | no | **ChatGPT-User**, PerplexityBot (retrieval agents) |
| rollingstone.com | yes | no | **ChatGPT-User**, OAI-SearchBot, PerplexityBot |
| residentadvisor.net | yes | no | **ChatGPT-User**, PerplexityBot |
| angrymetalguy.com (Cloudflare managed) | yes | no | `Content-Signal: search=yes,ai-train=no,use=reference` |
| warp.net (label, Cloudflare managed) | yes | no | same Content-Signal line |
| bandcamp.com / daily.bandcamp.com | yes | no | GPTBot, CCBot, Google-Extended |
| invisibleoranges, stereogum, brooklynvegan, decibelmagazine, metalinjection, thequietus, factmag, tinymixtapes, sputnikmusic, theneedledrop, subpop, relapse, nuclearblast, metal-archives | no | no | none |
| treblezine.com, discogs.com, rateyourmusic.com | robots.txt itself returned 403 to an automated fetch | | |

Notable: Cloudflare's managed robots.txt (on angrymetalguy.com and warp.net) now opens with "**As a condition of accessing this website, you agree to abide by the following content signals**" and ends "ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790". Cloudflare documents `use=reference` as "Index, excerpt, and link back", against `use=full` "Summarize and reproduce" and `use=immediate` "Interact, but store and reuse nothing" (read today, https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ ; Cloudflare calls it a test). These sites set no `ai-input` value, so they express no preference on retrieval.

**Generic terms.** Most webzine and blog terms (where they exist) grant personal, non-commercial use and reserve copyright. Like Bandcamp's, these are browsewrap and of uncertain force against restating facts (section 1.1). Blogger and WordPress.com posts belong to their authors. Label press releases are written to be republished by the press, which gives a loose implied licence for coverage, not for bulk reuse. Their facts are free either way. I did not read individual webzine terms pages beyond the robots files.

**Norm-based risk.** The legal risk of a few facts plus a link is small. The real risk is reputational. Small webzines and bloggers are hostile to AI tools that read them and send no traffic, and many now block retrieval agents specifically (the table above). Respect those signals even where the law would not force you. Credit the outlet by name with a followed link, never summarise a review's verdict, and answer complaints quickly.

**Verdict:** facts only, under the conditions in section 4.

### 2.5 YouTube

- **Terms of Service** (version served today is "Dated: December 15, 2023", https://www.youtube.com/t/terms): "You may view or listen to Content for your personal, non-commercial use." You are not allowed to "access, reproduce, download, distribute ... or otherwise use any part of the Service or any Content except: (a) as expressly authorized by the Service; or (b) with prior written permission", nor "access the Service using any automated means (such as robots, botnets or scrapers) except (a) in the case of public search engines, in accordance with YouTube's robots.txt file; or (b) with YouTube's prior written permission".
- **Developer Policies** (last updated 2026-09-14, https://developers.google.com/youtube/terms/developer-policies): "You and your API Clients must not ... directly or indirectly, scrape YouTube Applications ... or obtain scraped YouTube data or content." Non-Authorized Data may be stored "not longer than 30 calendar days" and must then be deleted or refreshed. Ads may not be sold on a page with YouTube API Data "unless other data, content, or material not obtained from YouTube appears on the same page and offers enough independent value".
- **YouTube API Services Terms** (last updated 2026-09-14, https://developers.google.com/youtube/terms/api-services-terms-of-service): I found no AI-specific clause.
- robots.txt (read today) does not disallow `/watch`, but the ToS automated-access clause applies to anyone who is not a public search engine.

**Verdict:** a person reading a description: personal viewing only, low value. **Automated: only through the YouTube Data API** (`videos.list`, `part=snippet`). Extract facts (label, ℗ line, release date, credits; auto-generated "Provided to YouTube by ..." descriptions carry these), delete the raw description within 30 days, link the video. Expect little background text: most descriptions are boilerplate.

### 2.6 Using an LLM provider's built-in web search and web fetch

Read today:
- **Web fetch** (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool): "the API fetches the content during the request". Error `url_not_allowed` covers URLs "blocked by domain filtering rules ... or by Anthropic-side restrictions, such as private addresses, `robots.txt`, and URLs that appear to contain a credential". It fetches only URLs that "have previously appeared in the conversation". It "does not support websites dynamically rendered with JavaScript". It supports `allowed_domains`/`blocked_domains` and `max_uses`, and caches results.
- **Web search** (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool): "Citations are always enabled for web search"; "When displaying API outputs directly to end users, citations must be included to the original source. If you are making modifications to API outputs ... display citations as appropriate based on consultation with your legal team." $10 per 1,000 searches.
- **Anthropic's crawlers** (privacy centre article 8896518, updated 7 April 2026; read through a fetch summary, not raw): `ClaudeBot` collects training data; `Claude-User` "visits sites when someone asks Claude a question"; `Claude-SearchBot` indexes for search. "Anthropic's Bots" honour robots.txt and the non-standard `Crawl-delay`. https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler . The fetch-tool docs do not name the user agent; the privacy article implies `Claude-User`.
- **Commercial Terms** (read today, https://www.anthropic.com/legal/commercial-terms): the customer "owns its Outputs" and warrants it "has all rights and permissions required to submit Inputs". The IP indemnity excludes claims arising from "Inputs or other data provided by Customer" and from use the customer knows or should know infringes. "Third Party Features are not Services".

**Does the tool change whose access it is?** Mostly no:
- The **choice** of what to read and the **publication** are recmyrecord's. Copyright liability for the published notes rests with the site whoever fetched the page. Contractually, a site's terms bind "you" when you use the site, and doing it through an agent you direct does not change that. The Reddit and Bandcamp prohibitions cover access "by any means (automated or otherwise)" and access "through ... automated means", which includes an agent.
- What it **does** give: robots.txt compliance by default (Reddit's `Disallow: /` and Pitchfork's `Claude-User` block are refused automatically), no JavaScript and so no bot-challenge circumvention, an identified agent, and source URLs for citation.
- What it **does not** give: compliance with site terms (Bandcamp's AUP), with Content-Signal `ai-input`/`use` values, or with TDM reservations made through TDMRep or HTML meta. The pipeline must check those itself.
- If you use your own search API instead: Brave Search API plans reportedly separate "Data for Search" from "Data for AI" ("rights to use data for AI inference") and allow storing results only on storage-rights plans (secondhand, https://api-docs.search.brave.software/pricing). Do not scrape Google: Google is suing SerpApi over exactly that (secondhand, https://searchengineland.com/google-sues-serpapi-466541).

---

## 3. robots.txt, AI opt-outs and the EU text and data mining exception

### 3.1 What the EU law says

DSM Directive 2019/790 (read through legislation.gov.uk's copy of the adopted text):
- Art. 2(2): "'text and data mining' means any automated analytical technique aimed at analysing text and data in digital form in order to generate information which includes but is not limited to patterns, trends and correlations".
- Art. 4(1): an exception "for reproductions and extractions of lawfully accessible works and other subject matter for the purposes of text and data mining". It covers copyright, the database right (96/9/EC Art. 7(1)) and the press publishers' right (Art. 15).
- Art. 4(2): copies "may be retained for as long as is necessary for the purposes of text and data mining."
- Art. 4(3): it applies "on condition that the use of works and other subject matter referred to in that paragraph has not been expressly reserved by their rightholders in an appropriate manner, such as machine-readable means in the case of content made publicly available online."
- Recital 18: "In the case of content that has been made publicly available online, it should only be considered appropriate to reserve those rights by the use of machine-readable means, including metadata and terms and conditions of a website or a service." Also: "Other uses should not be affected by the reservation of rights for the purposes of text and data mining."
- Recital 14: "Lawful access should also cover access to content that is freely available online."
- Art. 7(1): "Any contractual provision contrary to the exceptions provided for in Articles 3, 5 and 6 shall be unenforceable." **Art. 4 is not on that list**, so a site's terms may lawfully forbid commercial TDM (Bandcamp's AUP does).
- Art. 3 (research organisations and cultural heritage institutions, not overridable by contract) does **not** apply to recmyrecord.

### 3.2 Does it apply to this pipeline?

- **Probably yes, as to the input.** An LLM reading a page to pull out dated facts is plausibly "an automated analytical technique ... to generate information". The fetch and the model's working copy are reproductions, so where EU law applies, Art. 4 is what makes those copies lawful. The fallback is the temporary-copies exception, InfoSoc Art. 5(1): copies that are "transient or incidental, ... an integral and essential part of a technological process", for a lawful use, with "no independent economic significance". Whether LLM processing for a commercial product meets that is untested.
- **Not as to the output.** Art. 4 covers reproductions made *for* mining. It does not license publishing expression. That is fine, because publishing facts needs no licence. If an output reproduced wording, Art. 4 would not save it. Compare *GEMA v OpenAI* (LG München I, 42 O 14139/24, 11 Nov 2025): memorised lyrics reproduced in outputs were held outside the TDM exception (secondhand, https://www.taylorwessing.com/de/insights-and-events/insights/2025/11/gema-v-openai). And *Like Company v Google* (CJEU C-250/25, chatbot reuse of press content; hearing 10 March 2026; Advocate General's opinion scheduled for 3 Sept 2026, which I could not confirm was delivered or read) may soon say more about grounding and summaries (secondhand, https://www.twobirds.com/en/insights/2026/like-company-v-google-cjeu-holds-first-ever-hearing-on-generative-ai-and-copyright-on-10-march-2026).
- **So the opt-out matters.** Where a rightholder has reserved TDM in a valid way, the Art. 4 cover for the fetch-and-process copies is gone in the EU. A facts-only output still does not infringe, but the input copies have weaker footing.

### 3.3 What counts as a valid opt-out

- **robots.txt** naming the agent: widely treated as machine-readable. It is not a legal standard in itself, but it is the main signal courts and the AI Act's code of practice look at.
- **Natural-language terms** (like Bandcamp's AUP): *Kneschke v LAION* (OLG Hamburg, 5 U 104/24, 10 Dec 2025) held that a natural-language reservation was **not** machine-readable for uses in 2021. The lower court in 2024 had suggested the opposite, and commentators read the appeal ruling as tied to the technology of 2021. An appeal to the Federal Court of Justice was allowed (secondhand, https://www.twobirds.com/en/insights/2025/germany/higher-regional-court-hamburg-confirms-ai-training-was-permitted-(kneschke-v,-d-,-laion)). For 2026 this is unsettled. Treat clear terms as binding anyway, contractually if not as an Art. 4 reservation.
- **Cloudflare Content Signals** (`Content-Signal: search=..., ai-input=..., ai-train=..., use=...`): `ai-input` is defined as "inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers)" (Cloudflare policy text, read today, https://blog.cloudflare.com/content-signals-policy/). **That is this pipeline.** The policy text declares restrictions to be Art. 4 reservations.
- **W3C TDMRep** (`/.well-known/tdmrep.json`, `tdm-reservation` HTTP header or HTML meta; a Community Group report, not a W3C standard): https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240202/ . Common among French and other EU publishers.
- **IETF AI Preferences** (`draft-ietf-aipref-vocab`, latest draft 14 Sept 2026, still a working-group draft, categories being renamed): https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/ (secondhand on its current status).
- **ai.txt** (Spawning, 2023): an informal file of training opt-outs, not a standard; several unrelated proposals share the name (secondhand).

### 3.4 Does it matter whether the agent respects them?

Yes, on four counts:
1. **EU:** ignoring a valid reservation removes the Art. 4 cover for the copies made.
2. **US contract and trespass theories** get stronger when the defendant ignored explicit signals. Some robots files now say "As a condition of accessing this website, you agree ...".
3. **Anti-circumvention**: getting past a technical barrier (bot challenge, login) is what the surviving DMCA §1201 claims in *Reddit v. SerpApi/Perplexity* are about.
4. **Norms and reputation**: respecting signals is the cheapest protection for a small public project.

Rule for the pipeline: honour robots.txt **for every Anthropic and OpenAI agent name, not just the one doing the fetching**. Treat a block of any *retrieval* agent (`Claude-User`, `Claude-SearchBot`, `ChatGPT-User`, `OAI-SearchBot`, `Perplexity-User`, `PerplexityBot`) as `ai-input=no`. Honour `ai-input=no`, `use=immediate`, TDMRep reservations and `noai`-style meta tags. Where `use=reference`, take only short facts plus a link and do not write a summary of that page. A block of training agents only (`ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`) with no retrieval block is not an objection to this use: the pipeline does not train.

---

## 4. Recommendation

### 4.1 Ranked source types for the no-Wikipedia albums

Already covered in SOURCES.md and to be used first: Wikidata, MusicBrainz core, Discogs CC0 dumps, other-language Wikipedias.

1. **The artist's or label's own website**: official bio, release page, news post, press release, liner-notes page. This is the most authoritative source and the most willing to be read (they want coverage). Conditions: robots and AI signals as above; facts only; link the page; no quotes. Also check the label's or artist's site rather than the press-release copy on an aggregator.
2. **Text supplied by the artist or label with written permission** (section 4.4). The only route to *quoting* or *adapting* an "about" text.
3. **Interviews and features** in webzines, magazines and blogs where the artist describes how and where the album was made. These are the best "idea behind it" facts. Facts only and attributed ("the band told *Invisible Oranges* ..."), no evaluations, at least two sources where possible, link each.
4. **Reviews** in webzines and blogs, **for facts only** (recording details, line-up changes, label history). Never the verdict or descriptive prose.
5. **Encyclopaedia Metallum** for metal releases: release-page facts only, 3-second delay, link.
6. **YouTube descriptions via the Data API**: label, ℗, release date; 30-day raw-data limit; link.
7. **Other-language sources** (Japanese, Brazilian, Polish blogs and magazines): same rules. Translate facts, not prose.

**Avoid in the pipeline:**
- **Bandcamp** album pages and Bandcamp Daily (AUP bans scraping, TDM and AI ingestion; licence is personal and non-commercial). Link only.
- **Reddit** (robots disallows all; scraping needs written consent; commercial API needs a deal; active litigation). Human lead only.
- **Sites that block retrieval agents or set `ai-input=no`, `use=immediate` or a TDM reservation** (in the sample: Pitchfork, The Wire, NME, Rolling Stone, Resident Advisor). Link only.
- **Anything behind a login, paywall or bot challenge**, archived copies of pages that are blocked live, and content-farm rehosts of others' articles.
- From SOURCES.md: RYM, Genius, AllMusic text, Last.fm wiki, Apple notes, MusicBrainz annotations.

### 4.2 Pipeline conditions (checklist)

- Use the provider's web search plus web fetch (robots-aware, no JavaScript), with `blocked_domains` set to bandcamp.com, reddit.com, youtube.com (use the API instead), rateyourmusic.com, genius.com, last.fm, allmusic.com, and every domain found to set `ai-input=no`.
- Before each fetch, a pre-check step reads robots.txt, Content-Signal, `/.well-known/tdmrep.json` and the `tdm-reservation` header, and applies section 3.4. Cache these results per domain.
- At most 1 request per second per domain, or the site's `Crawl-delay` if longer (Metallum: 3 s). Identify with a User-Agent that has a contact address if fetching directly. Never retry past a 403, 429 or challenge page.
- Volume estimate: 2,100 albums at about 3 to 6 searches and 3 to 6 fetches each is about 10,000 searches (about $100 at $10 per 1,000) and a similar number of fetches spread over hundreds of domains.
- Clean-room extraction, then writing, then an overlap check (section 1.3). Store per fact: `source_url`, `retrieved_at`, `source_kind` (artist, label, interview, review, database). Delete raw pages after the check; never commit them.
- Prefer an artist or label source for any fact also found in a review.
- No quotes, no evaluative language from sources, no private personal data.
- Write less when sources are thin. Hide "show more" when there are fewer than about four solid facts.
- License the committed notes (your own text) as you choose; consider CC BY 4.0 so the facts-and-links data is reusable. Wikipedia-derived notes stay CC BY-SA 4.0 as in SOURCES.md.

### 4.3 Attribution UI

Under each note, a one-line credit naming the kind of source and the outlet, each linked, in plain words (no dashes, per `copy.ts` rules; Samer signs off copy):

> Written by recmyrecord from the label's page about the album, an interview in Invisible Oranges and Encyclopaedia Metallum.

Variants:
- Artist text with permission: "In the band's own words, shared with their permission." (Link to the artist's site or Bandcamp page.)
- Single source: "Written by recmyrecord from an interview in Decibel."
- Footer link on every note: "Spotted a mistake, or is this about your record? Tell us :)" (with a non-breaking space before ":)").

Do not imply endorsement ("from the artist's Bandcamp page") when the pipeline did not read that page. Name only sources actually used. A separate "Listen and read more" row may link Bandcamp, Metallum, Discogs and reviews without claiming they were sources.

### 4.4 Asking artists and labels for permission

Worth doing for the long tail. Many underground artists will gladly say yes, and it is the only clean way to use Bandcamp "about" texts, which the Terms allow with permission "from the copyright holder". Bandcamp's AI-ingestion ban is a separate obstacle, which is why the text should come **from the artist**, not from Bandcamp's page.

How:
- **Who:** the contact listed on the artist's or label's own site or social profile, or the label for label releases. Prioritise albums where the notes would otherwise be empty.
- **What to ask** (short, plain email): permission to show their album description, or a short text they write, on recmyrecord, "a free album recommendation site that may carry ads or a paid plan later"; credited and linked to their page; non-exclusive; they can ask us to change or remove it at any time; we may shorten it for length but will not change its meaning (or: we will show it unchanged).
- **Easier still:** a "Tell us about this record" form for artists and labels. They submit or approve text and confirm "I wrote this or have the right to share it and I'm happy for recmyrecord to show it, credited to me." That gives a clear licence, a warranty and a record.
- **Records:** keep permissions (who, when, scope, email) **outside the public repository**. Personal data and email addresses must not go into issues or commits (the repository and the board are public). In the repository keep only a flag such as `text_source: "artist_permission"` and a date.
- **Labels:** ask once per label for all of its releases. Labels usually own the press-release text and are the easiest to get a blanket yes from.

---

## Sources read today (primary)

- Reddit User Agreement, Data API Terms, Developer Terms, robots.txt: https://www.redditinc.com/policies/user-agreement , https://redditinc.com/policies/data-api-terms , https://redditinc.com/policies/developer-terms , https://www.reddit.com/robots.txt
- Reddit Public Content Policy (archived 2026-10-05): https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy
- Bandcamp Terms of Use (archived 2026-10-04), Acceptable Use and Moderation Policy, robots.txt: https://bandcamp.com/terms_of_use , https://get.bandcamp.help/articles/15263124-bandcamp-s-acceptable-use-and-moderation-policy , https://bandcamp.com/robots.txt
- Encyclopaedia Metallum robots, FAQ, Rules, Privacy Policy, Tools: https://www.metal-archives.com/robots.txt , /content/faq , /content/rules , /content/pp , /content/tools
- YouTube Terms, Developer Policies, API Services Terms, robots: https://www.youtube.com/t/terms , https://developers.google.com/youtube/terms/developer-policies , https://developers.google.com/youtube/terms/api-services-terms-of-service
- Anthropic web fetch and web search docs, Commercial Terms: links in section 2.6
- 17 U.S.C. §102: https://www.law.cornell.edu/uscode/text/17/102 ; *Feist*: https://www.law.cornell.edu/supremecourt/text/499/340
- Directive 96/9/EC Arts. 7, 8, 11; Directive 2019/790 Arts. 2, 4, 7, 15 and recitals 14, 18, 57, 58; Directive 2001/29/EC Art. 5(1): legislation.gov.uk copies of the adopted texts (EUR-Lex blocked automated fetches)
- Cloudflare Content Signals policy text and content-use docs: https://blog.cloudflare.com/content-signals-policy/ , https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/
- robots.txt of 32 music sites (table in section 2.4)

Secondhand (reporting or commentary, primary not read): *Reddit v. Anthropic* and *Reddit v. SerpApi/Perplexity* status; *X Corp. v. Bright Data*; *Meta v. Bright Data*; *Advance Local v. Cohere*; *Comline*; *NBA v. Motorola* and *Barclays*; *Kneschke v LAION* (OLG Hamburg); *GEMA v OpenAI*; *CV-Online*; *Like Company* (C-250/25) status; Anthropic crawler article (read through a summarising fetch); IETF aipref status; Brave Search API plans; ai.txt. From memory, not re-read: *Infopaq*, *Perlentaucher*, *British Horseracing Board*.
