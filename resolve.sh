#!/bin/bash
# Quick issue resolution script using gh CLI directly
# No dependencies required - just gh CLI

set -e

ORGS=("chittyos" "chittyapps" "chittyfoundation" "chittycorp")
DRY_RUN=${DRY_RUN:-true}
STALE_DAYS=${STALE_DAYS:-90}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}ChitCommit Auto Issue Resolver${NC}"
echo "================================"
echo "Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY RUN" || echo "LIVE")"
echo "Stale threshold: $STALE_DAYS days"
echo ""

# Stats
SCANNED=0
CLOSED=0
SKIPPED=0

close_issue() {
    local repo=$1
    local issue=$2
    local reason=$3

    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Would close $repo#$issue ($reason)"
    else
        gh issue close "$issue" --repo "$repo" --comment "Auto-closed: $reason" 2>/dev/null && \
            echo -e "${GREEN}Closed${NC} $repo#$issue ($reason)" || \
            echo -e "${RED}Failed${NC} to close $repo#$issue"
        ((CLOSED++))
    fi
}

is_stale() {
    local updated=$1
    local updated_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$updated" "+%s" 2>/dev/null || date -d "$updated" "+%s" 2>/dev/null)
    local now_ts=$(date "+%s")
    local diff_days=$(( (now_ts - updated_ts) / 86400 ))
    [ $diff_days -gt $STALE_DAYS ]
}

is_bot_issue() {
    local title=$1
    # Match patterns: [P1], _text_, Badge issues
    [[ "$title" =~ ^\[P[0-9]\] ]] || \
    [[ "$title" =~ ^_.*_$ ]] || \
    [[ "$title" =~ Badge.*flat ]]
}

has_protected_label() {
    local labels=$1
    [[ "$labels" =~ critical|security|in-progress|help-wanted ]]
}

for org in "${ORGS[@]}"; do
    echo -e "\n${BLUE}=== $org ===${NC}"

    # Get all repos
    repos=$(gh repo list "$org" --limit 100 --json name,isArchived,hasIssuesEnabled -q '.[] | select(.isArchived==false and .hasIssuesEnabled==true) | .name')

    for repo in $repos; do
        # Get open issues (not PRs)
        issues=$(gh issue list --repo "$org/$repo" --state open --json number,title,updatedAt,labels --limit 100 2>/dev/null || echo "[]")

        if [ "$issues" = "[]" ] || [ -z "$issues" ]; then
            continue
        fi

        echo -e "\n${YELLOW}$org/$repo${NC}"

        # Process each issue
        echo "$issues" | jq -c '.[]' | while read -r issue; do
            ((SCANNED++))

            num=$(echo "$issue" | jq -r '.number')
            title=$(echo "$issue" | jq -r '.title')
            updated=$(echo "$issue" | jq -r '.updatedAt')
            labels=$(echo "$issue" | jq -r '[.labels[].name] | join(",")')

            # Skip protected
            if has_protected_label "$labels"; then
                echo -e "  #$num: ${GREEN}protected${NC} - ${title:0:50}"
                ((SKIPPED++))
                continue
            fi

            # Check bot issues
            if is_bot_issue "$title"; then
                close_issue "$org/$repo" "$num" "Bot/automated issue cleanup"
                continue
            fi

            # Check stale
            if is_stale "$updated"; then
                close_issue "$org/$repo" "$num" "Stale (no activity for $STALE_DAYS+ days)"
                continue
            fi

            echo -e "  #$num: ${GREEN}active${NC} - ${title:0:50}"
        done
    done
done

echo -e "\n${BLUE}=== Summary ===${NC}"
echo "Scanned: $SCANNED"
echo "Closed: $CLOSED"
echo "Skipped (protected): $SKIPPED"
echo ""
echo "To run in live mode: DRY_RUN=false ./resolve.sh"
