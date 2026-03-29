# LLM Model Analysis for Kodi

Analysis of available models for use with LiteLLM, based on [Arena AI Leaderboard](https://arena.ai/leaderboard) rankings and pricing data.

Last reviewed: 2026-03-29

## Current setup

**Model**: Moonshot Kimi K2.5
**Arena rank**: #23 (score 1442)
**LiteLLM config**: `moonshot/kimi-k2.5`
**Pricing**: ~$0.60/M input, ~$2.00/M output

Kimi K2.5 is a solid mid-tier model but there are significantly better options in both intelligence and pricing.

## Model comparison

Sorted by intelligence-to-price ratio (best value first).

| Model | Arena Rank | Score | Input $/M | Output $/M | Provider | LiteLLM ID | Notes |
|-------|-----------|-------|-----------|------------|----------|-----------|-------|
| Gemini 3 Flash | #9 | 1474 | ~$0.10 | ~$0.40 | Google | `gemini/gemini-3-flash` | **Best value.** Top-10 intelligence, 5-10x cheaper than Kimi |
| Gemini 2.5 Flash | ~#30 | ~1430 | ~$0.075 | ~$0.30 | Google | `gemini/gemini-2.5-flash` | Cheapest competitive model |
| DeepSeek V3 | ~#35 | ~1420 | ~$0.27 | ~$1.10 | DeepSeek | `deepseek/deepseek-chat` | Very cheap, good quality, open-weight |
| GPT-5.4-mini | #22 | 1443 | ~$0.30 | ~$2.20 | OpenAI | `openai/gpt-5.4-mini` | Good balance, OpenAI reliability |
| Kimi K2.5 (current) | #23 | 1442 | ~$0.60 | ~$2.00 | Moonshot | `moonshot/kimi-k2.5` | Current model — decent but outclassed |
| Gemini 3 Pro | #5 | 1486 | ~$1.25 | ~$5.00 | Google | `gemini/gemini-3-pro` | Premium intelligence at mid-range price |
| GPT-5.4 | #6 | 1484 | ~$2.50 | ~$10.00 | OpenAI | `openai/gpt-5.4` | Top-tier, expensive |
| Claude Sonnet 4.6 | #17 | 1455 | $3.00 | $15.00 | Anthropic | `anthropic/claude-sonnet-4-6` | Premium quality, pricey |
| Claude Opus 4.6 | #2 | 1500 | $5.00 | $25.00 | Anthropic | `anthropic/claude-opus-4-6` | Best intelligence, very expensive |
| Gemini 3.1 Pro Preview | #1 | 1493 | ~$1.25 | ~$5.00 | Google | `gemini/gemini-3.1-pro-preview` | Top ranked, preview availability |

## Recommendations

### Best overall value: Gemini 3 Flash
- **32 ELO points above** Kimi K2.5 (1474 vs 1442)
- **5-10x cheaper** than Kimi K2.5
- Top-10 model globally
- Requires: Google AI Studio API key (`GEMINI_API_KEY`)
- LiteLLM model name: `gemini/gemini-3-flash`

### Best budget option: Gemini 2.5 Flash or DeepSeek V3
- Gemini 2.5 Flash: ~$0.075 input — essentially free at our scale
- DeepSeek V3: ~$0.27 input — very cheap, Chinese provider (privacy considerations)
- Both are competitive with Kimi K2.5 in quality

### Best premium option: Gemini 3 Pro
- Rank #5 globally (score 1486)
- 3-5x cheaper than Claude/GPT equivalents at the same tier
- Good upgrade path from Gemini 3 Flash for premium users

### Best-in-class (expensive): Claude Opus 4.6
- Rank #2 globally (score 1500)
- $5/$25 per million tokens — 50x more expensive than Gemini 3 Flash
- Only justified for high-value tasks where quality is critical

## Suggested LiteLLM configuration

Multi-model setup with tiers:

```yaml
model_list:
  # Default — best value
  - model_name: "gemini/gemini-3-flash"
    litellm_params:
      model: "gemini/gemini-3-flash"
      api_key: "os.environ/GEMINI_API_KEY"

  # Premium tier
  - model_name: "gemini/gemini-3-pro"
    litellm_params:
      model: "gemini/gemini-3-pro"
      api_key: "os.environ/GEMINI_API_KEY"

  # Fallback (current)
  - model_name: "moonshot/kimi-k2.5"
    litellm_params:
      model: "moonshot/kimi-k2.5"
      api_key: "os.environ/MOONSHOT_API_KEY"
      extra_body:
        thinking:
          type: "disabled"
```

## Provider API key requirements

| Provider | Env var | How to get |
|----------|---------|-----------|
| Google AI Studio | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| Moonshot (current) | `MOONSHOT_API_KEY` | Already configured |
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Anthropic | `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| DeepSeek | `DEEPSEEK_API_KEY` | https://platform.deepseek.com/ |

## Cost projection

At 1000 messages/day (~500 tokens avg input, ~1000 tokens avg output per message):

| Model | Daily input cost | Daily output cost | Monthly total |
|-------|-----------------|-------------------|---------------|
| Gemini 3 Flash | $0.05 | $0.40 | ~$13 |
| Kimi K2.5 (current) | $0.30 | $2.00 | ~$69 |
| Gemini 3 Pro | $0.63 | $5.00 | ~$169 |
| Claude Sonnet 4.6 | $1.50 | $15.00 | ~$495 |

**Switching from Kimi K2.5 to Gemini 3 Flash would save ~80% while improving quality.**
