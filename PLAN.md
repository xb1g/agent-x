# Implementation Plan: v0.2 — Mobile + Wizard

## Overview

Transform the research page into a guided wizard that helps founders discover their ICP with AI assistance. Make the entire app mobile-first with top tab navigation.

---

## Phase 1: Mobile-First UI Foundation

### 1.1 Top Tab Bar Navigation

**File:** `app/page.tsx`

Replace side tabs with top tab bar:

```tsx
// Mobile-first top navigation
<nav className="top-tabs">
  <button className={activeTab === 'research' ? 'active' : ''}>
    <img src="/logo.png" alt="Agent-X" className="tab-logo" />
    <span>Research</span>
  </button>
  <button className={activeTab === 'board' ? 'active' : ''}>
    <span>Board</span>
    {metrics.pending > 0 && <span className="badge">{metrics.pending}</span>}
  </button>
  <button className={activeTab === 'interview' ? 'active' : ''}>
    <span>Interview</span>
  </button>
</nav>
```

**CSS:** `app/globals.css`

```css
.top-tabs {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 1rem;
}

.top-tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.top-tabs button.active {
  color: var(--text);
  border-bottom-color: var(--primary);
}

.tab-logo {
  width: 24px;
  height: 24px;
}

.badge {
  background: var(--primary);
  color: white;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
}

@media (min-width: 768px) {
  .top-tabs {
    padding: 0 2rem;
  }
}
```

### 1.2 Logo Integration

**Copy logo to public:**
```bash
cp logo.png public/logo.png
```

---

## Phase 2: Research Wizard

### 2.1 Wizard State Machine

**File:** `app/page.tsx`

```tsx
type WizardStep = 'customer' | 'segment' | 'problem' | 'confirm'

const [wizardStep, setWizardStep] = useState<WizardStep>('customer')
const [roughInput, setRoughInput] = useState('')
const [selectedSegment, setSelectedSegment] = useState<string | null>(null)
const [aiSegments, setAiSegments] = useState<string[]>([])
const [aiProblems, setAiProblems] = useState<string[]>([])
const [isAnalyzing, setIsAnalyzing] = useState(false)
```

### 2.2 AI Segment Suggestion

**File:** `lib/gemini.ts`

```tsx
export async function suggestSegments(roughInput: string): Promise<string[]> {
  const { text } = await generateText({
    model: google(FLASH_MODEL),
    prompt: `A founder said they're building for: "${roughInput}"

Suggest 4 specific customer segments they could target. Be specific.

Return a JSON array of 4 segment names.

Example:
Input: "SaaS founders"
Output: ["Early-stage SaaS founders (pre-revenue)", "Bootstrapped SaaS founders", "B2B SaaS founders (enterprise)", "SaaS founders at growth stage ($1M+ ARR)"]

Output only the JSON array.`,
  })
  
  return JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim())
}

export async function suggestProblems(segment: string): Promise<string[]> {
  const { text } = await generateText({
    model: google(FLASH_MODEL),
    prompt: `For this customer segment: "${segment}"

Suggest 4 common problems/pain points they have.

Return a JSON array of 4 problem descriptions.

Example:
Input: "Bootstrapped SaaS founders"
Output: ["Pricing strategy and monetization", "Customer churn and retention", "Feature prioritization with limited resources", "Finding product-market fit"]

Output only the JSON array.`,
  })
  
  return JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim())
}
```

### 2.3 Wizard UI Components

**File:** `app/page.tsx`

```tsx
// Step 1: Rough Customer Input
function WizardCustomerStep() {
  return (
    <div className="wizard-step">
      <h2>🎯 Who are you building for?</h2>
      <p className="wizard-help">Start with a rough idea. I'll help you refine it.</p>
      
      <input
        type="text"
        value={roughInput}
        onChange={(e) => setRoughInput(e.target.value)}
        placeholder="e.g., SaaS founders, people learning to code, small business owners"
        className="wizard-input-large"
      />
      
      <div className="wizard-examples">
        <p>Examples:</p>
        <button onClick={() => setRoughInput('SaaS founders')}>SaaS founders</button>
        <button onClick={() => setRoughInput('People learning to code')}>People learning to code</button>
        <button onClick={() => setRoughInput('Small business owners')}>Small business owners</button>
      </div>
      
      <button 
        className="wizard-next"
        onClick={handleAnalyzeCustomer}
        disabled={!roughInput.trim() || isAnalyzing}
      >
        {isAnalyzing ? 'Analyzing...' : 'Next →'}
      </button>
    </div>
  )
}

// Step 2: Pick Segment
function WizardSegmentStep() {
  return (
    <div className="wizard-step">
      <h2>💡 Pick a segment</h2>
      <p className="wizard-help">Based on "{roughInput}", here are specific segments:</p>
      
      <div className="wizard-options">
        {aiSegments.map((segment) => (
          <button
            key={segment}
            className={`wizard-option ${selectedSegment === segment ? 'selected' : ''}`}
            onClick={() => setSelectedSegment(segment)}
          >
            {segment}
          </button>
        ))}
        <button
          className="wizard-option"
          onClick={() => setSelectedSegment('custom')}
        >
          Something else...
        </button>
      </div>
      
      <div className="wizard-nav">
        <button onClick={() => setWizardStep('customer')}>← Back</button>
        <button 
          onClick={handleSelectSegment}
          disabled={!selectedSegment}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// Step 3: Pick Problem
function WizardProblemStep() {
  return (
    <div className="wizard-step">
      <h2>😰 What problem do they have?</h2>
      <p className="wizard-help">Common problems for {selectedSegment}:</p>
      
      <div className="wizard-options">
        {aiProblems.map((problem) => (
          <button
            key={problem}
            className={`wizard-option ${selectedProblem === problem ? 'selected' : ''}`}
            onClick={() => setSelectedProblem(problem)}
          >
            {problem}
          </button>
        ))}
      </div>
      
      <input
        type="text"
        value={customProblem}
        onChange={(e) => setCustomProblem(e.target.value)}
        placeholder="Or describe a different problem..."
        className="wizard-input"
      />
      
      <div className="wizard-nav">
        <button onClick={() => setWizardStep('segment')}>← Back</button>
        <button onClick={handleStartResearch}>
          Start Research →
        </button>
      </div>
    </div>
  )
}
```

### 2.4 Wizard Styles

**File:** `app/globals.css`

```css
/* Wizard Styles */
.wizard-step {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.wizard-step h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.wizard-help {
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}

.wizard-input-large {
  width: 100%;
  font-size: 1.25rem;
  padding: 1rem;
  border: 2px solid var(--border);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.wizard-input-large:focus {
  outline: none;
  border-color: var(--primary);
}

.wizard-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.wizard-examples button {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.875rem;
}

.wizard-examples button:hover {
  background: var(--bg-tertiary);
}

.wizard-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.wizard-option {
  width: 100%;
  padding: 1rem;
  text-align: left;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.wizard-option:hover {
  border-color: var(--primary);
}

.wizard-option.selected {
  border-color: var(--primary);
  background: var(--primary-light);
}

.wizard-nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.wizard-next,
.wizard-nav button:last-child {
  background: var(--primary);
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 500;
}

.wizard-nav button:first-child {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
}

/* Mobile optimizations */
@media (max-width: 640px) {
  .wizard-step {
    padding: 1rem;
  }
  
  .wizard-step h2 {
    font-size: 1.25rem;
  }
  
  .wizard-input-large {
    font-size: 1rem;
  }
}
```

---

## Phase 3: Board Improvements

### 3.1 Segment Controls

**File:** `app/page.tsx`

Add pause/play and rename to segment cards:

```tsx
async function handlePauseSegment(segmentId: string) {
  // Update segment status to 'paused'
  await fetch(`/api/segment/${segmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'paused' }),
  })
}

async function handleRenameSegment(segmentId: string, newName: string) {
  await fetch(`/api/segment/${segmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ persona_name: newName }),
  })
}
```

### 3.2 Inspect Modal

**File:** `app/components/SegmentInspect.tsx`

```tsx
type Prospect = {
  username: string
  score: number
  snippet: string
  subreddit: string
  upvotes: number
  comments: number
  postUrl: string
  profileUrl: string
}

export function SegmentInspect({ segment }: { segment: SegmentCardData }) {
  const [prospects, setProspects] = useState<Prospect[]>([])
  
  useEffect(() => {
    fetch(`/api/segment/${segment.id}/prospects`)
      .then(res => res.json())
      .then(setProspects)
  }, [segment.id])
  
  return (
    <div className="inspect-modal">
      <header>
        <h2>{segment.persona_name}</h2>
        <button onClick={onClose}>×</button>
      </header>
      
      <section className="inspect-overview">
        <dl>
          <dt>Posts analyzed</dt>
          <dd>{segment.segment_size?.posts_indexed ?? 0}</dd>
          
          <dt>High-relevance</dt>
          <dd>{prospects.length}</dd>
          
          <dt>Subreddits</dt>
          <dd>{segment.subreddits.map(s => `r/${s}`).join(', ')}</dd>
        </dl>
      </section>
      
      <section className="inspect-prospects">
        <h3>🎯 High-Value Prospects</h3>
        <p>People actively expressing this pain, ready to talk:</p>
        
        {prospects.map(prospect => (
          <ProspectCard key={prospect.username} prospect={prospect} />
        ))}
      </section>
    </div>
  )
}

function ProspectCard({ prospect }: { prospect: Prospect }) {
  return (
    <div className="prospect-card">
      <header>
        <strong>u/{prospect.username}</strong>
        <span className="prospect-score">Score: {prospect.score.toFixed(1)}</span>
      </header>
      
      <p className="prospect-snippet">"{prospect.snippet}"</p>
      
      <footer>
        <span>📍 r/{prospect.subreddit} • {prospect.upvotes} upvotes</span>
        
        <div className="prospect-actions">
          <a href={prospect.postUrl} target="_blank" rel="noopener">
            View Post
          </a>
          <a href={prospect.profileUrl} target="_blank" rel="noopener">
            Reddit Profile
          </a>
          <button onClick={() => handleFindContact(prospect.username)}>
            Find Contact
          </button>
        </div>
      </footer>
    </div>
  )
}
```

---

## Phase 4: API Endpoints

### 4.1 Segment Management

**File:** `app/api/segment/[id]/route.ts`

```tsx
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  
  if (body.status === 'paused') {
    // Stop background processing
    // Update segment status
  }
  
  if (body.persona_name) {
    await updateSegment(params.id, { persona_name: body.persona_name })
  }
  
  return NextResponse.json({ success: true })
}
```

### 4.2 Prospects Endpoint

**File:** `app/api/segment/[id]/prospects/route.ts`

```tsx
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  // Get high-relevance posts for this segment
  const posts = await db.query(`
    SELECT 
      author_username,
      title,
      score,
      subreddit,
      permalink,
      pain_score
    FROM posts
    WHERE segment_id = $1
      AND pain_score > 5
    ORDER BY pain_score DESC
    LIMIT 20
  `, [params.id])
  
  // Transform to prospects
  const prospects = posts.rows.map(post => ({
    username: post.author_username,
    score: post.pain_score,
    snippet: post.title?.slice(0, 150),
    subreddit: post.subreddit,
    upvotes: post.score,
    postUrl: `https://reddit.com${post.permalink}`,
    profileUrl: `https://reddit.com/u/${post.author_username}`,
  }))
  
  return NextResponse.json({ prospects })
}
```

---

## Implementation Order

1. **Day 1: Mobile Foundation**
   - [ ] Top tab bar navigation
   - [ ] Logo integration
   - [ ] Mobile-first CSS audit

2. **Day 2: Wizard UI**
   - [ ] Wizard state machine
   - [ ] Step 1: Customer input
   - [ ] Step 2: Segment selection
   - [ ] Step 3: Problem selection

3. **Day 3: AI Integration**
   - [ ] `suggestSegments()` function
   - [ ] `suggestProblems()` function
   - [ ] Connect wizard to AI

4. **Day 4: Board Improvements**
   - [ ] Pause/play controls
   - [ ] Rename functionality
   - [ ] Inspect modal UI

5. **Day 5: Prospects API**
   - [ ] Prospects endpoint
   - [ ] Prospect cards
   - [ ] Contact links

---

## Success Metrics

- [ ] Wizard completes in < 30 seconds
- [ ] Mobile layout works on 375px width
- [ ] All tabs accessible with one tap
- [ ] Prospects show real Reddit users
- [ ] Contact links open in new tabs