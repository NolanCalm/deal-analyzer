#!/usr/bin/env python3
"""
Reddit Lead Hunter - DOE Execution Script
Scrapes Reddit for "Gold" leads in Event Planning & Property Management niches.
Implements Self-Annealing protocol for rate limit handling.
"""

import json
import time
import urllib.request
import urllib.error
import ssl
import sys
from datetime import datetime

# Self-Annealing Fix: Bypass SSL verification for macOS certificate issue
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Configuration
SUBREDDITS = [
    "EventPlanning", "weddingplanning", "WeddingPhotography", "event_planning",
    "PropertyManagement", "realestateinvesting", "landlords", "RealEstate"
]

PAIN_KEYWORDS = [
    # Event Planning pain points
    "nightmare", "disaster", "ruined", "last minute", "vendor cancelled", 
    "lost money", "wasted time", "stress", "frustrated", "manual", "spreadsheet",
    "missed", "forgot", "chaos", "overwhelming", "tracking nightmare",
    # Property Management pain points
    "tenant nightmare", "maintenance hell", "late rent", "eviction", "tracking",
    "inspection photos", "damage", "documentation", "lease", "violation",
    "move-out", "move-in", "turnover", "vacancy"
]

HIGH_STAKES_PHRASES = [
    "lost $", "cost me", "thousands", "hours", "lawsuit", "sued", "fired",
    "reputation", "client angry", "refund", "damage deposit", "security deposit"
]

MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

def log_failure(script, error, fix):
    """Log failures to failures.log for Self-Annealing protocol"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open("../directives/failures.log", "a") as f:
        f.write(f"[{timestamp}] | {script} | {error} | {fix}\n")

def fetch_reddit_json(subreddit, sort="new", limit=25, retry_count=0):
    """Fetch posts from a subreddit with Self-Annealing retry logic"""
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={limit}"
    headers = {
        "User-Agent": "DOE-LeadHunter/1.0 (Micro-SaaS Research Bot)"
    }
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15, context=ssl_context) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429 and retry_count < MAX_RETRIES:
            # Self-Annealing: Rate limited, apply exponential backoff
            delay = RETRY_DELAY * (2 ** retry_count)
            log_failure("reddit_scraper.py", f"429 Rate Limited on r/{subreddit}", 
                       f"Retry #{retry_count+1} after {delay}s backoff")
            print(f"  ⚠️  Rate limited on r/{subreddit}, retrying in {delay}s...")
            time.sleep(delay)
            return fetch_reddit_json(subreddit, sort, limit, retry_count + 1)
        else:
            log_failure("reddit_scraper.py", f"HTTP {e.code} on r/{subreddit}", "Skipping subreddit")
            print(f"  ❌ HTTP {e.code} error on r/{subreddit}, skipping...")
            return None
    except Exception as e:
        log_failure("reddit_scraper.py", str(e), "Skipping subreddit")
        print(f"  ❌ Error fetching r/{subreddit}: {e}")
        return None

def score_post(title, selftext, score, num_comments):
    """Score a post based on Gold criteria"""
    combined_text = (title + " " + selftext).lower()
    
    pain_score = sum(1 for kw in PAIN_KEYWORDS if kw in combined_text)
    stakes_score = sum(2 for phrase in HIGH_STAKES_PHRASES if phrase in combined_text) 
    engagement_score = min(3, (score + num_comments) // 10)
    
    return pain_score + stakes_score + engagement_score

def extract_one_button_solution(title, selftext):
    """Propose a 48-hour buildable AI solution"""
    combined_text = (title + " " + selftext).lower()
    
    if any(kw in combined_text for kw in ["photo", "image", "picture", "damage"]):
        return "📷 AI Photo Documentation Tool: Auto-categorize & timestamp property/event photos with damage detection"
    elif any(kw in combined_text for kw in ["spreadsheet", "tracking", "manual"]):
        return "📊 Smart Tracker: Replace spreadsheets with AI-powered task/client/tenant tracker with reminders"
    elif any(kw in combined_text for kw in ["vendor", "contractor", "communication"]):
        return "💬 Vendor Coordination Bot: Centralize vendor comms with AI-drafted messages & deadline tracking"
    elif any(kw in combined_text for kw in ["invoice", "payment", "late", "rent"]):
        return "💰 Payment Reminder System: Automated invoice/rent reminders with AI follow-up escalation"
    elif any(kw in combined_text for kw in ["inspection", "checklist", "walkthrough"]):
        return "✅ AI Inspection Assistant: Photo-based checklist completion with auto-generated reports"
    else:
        return "🤖 Workflow Automator: AI-powered process automation for repetitive manual tasks"

def hunt_leads():
    """Main lead hunting function"""
    print("=" * 60)
    print("🎯 DOE LEAD HUNTER - Scanning Reddit for Gold Leads")
    print("=" * 60)
    print(f"Target Niches: Event Planning | Property Management")
    print(f"Subreddits: {len(SUBREDDITS)}")
    print("-" * 60)
    
    leads = []
    
    for subreddit in SUBREDDITS:
        print(f"\n🔍 Scanning r/{subreddit}...")
        data = fetch_reddit_json(subreddit)
        
        if not data or "data" not in data:
            continue
            
        posts = data["data"].get("children", [])
        print(f"   Found {len(posts)} posts")
        
        for post in posts:
            p = post["data"]
            title = p.get("title", "")
            selftext = p.get("selftext", "")
            score = p.get("score", 0)
            num_comments = p.get("num_comments", 0)
            permalink = p.get("permalink", "")
            created_utc = p.get("created_utc", 0)
            
            lead_score = score_post(title, selftext, score, num_comments)
            
            if lead_score >= 3:  # Minimum threshold for potential lead
                leads.append({
                    "subreddit": subreddit,
                    "title": title[:100] + "..." if len(title) > 100 else title,
                    "url": f"https://reddit.com{permalink}",
                    "score": lead_score,
                    "engagement": f"{score} upvotes, {num_comments} comments",
                    "snippet": selftext[:200] + "..." if len(selftext) > 200 else selftext,
                    "solution": extract_one_button_solution(title, selftext),
                    "created": datetime.fromtimestamp(created_utc).strftime("%Y-%m-%d")
                })
        
        # Polite delay between subreddits
        time.sleep(1)
    
    # Sort by score and return top leads
    leads.sort(key=lambda x: x["score"], reverse=True)
    return leads[:10]  # Return top 10 for selection

def main():
    leads = hunt_leads()
    
    if not leads:
        print("\n❌ No qualifying leads found. Try adjusting keywords or subreddits.")
        return
    
    print("\n" + "=" * 60)
    print("🏆 TOP GOLD LEAD CANDIDATES")
    print("=" * 60)
    
    output = {"leads": leads[:3], "all_candidates": leads}
    
    # Output as JSON for artifact creation
    print(json.dumps(output, indent=2))
    
    # Also save to file
    with open("leads_output.json", "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Found {len(leads)} potential leads, top 3 selected as Gold")
    print("📁 Results saved to execution/leads_output.json")

if __name__ == "__main__":
    main()
