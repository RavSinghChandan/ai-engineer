# QUICKSTART.md - Get Running in 5 Minutes

## Step 1: Install Dependencies (1 minute)

```bash
cd /Users/chandankumar/Desktop/workspace/ai-engineer/demo

# Make setup script executable
chmod +x setup.sh

# Run setup
./setup.sh
```

Or manually:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Step 2: Add Your API Key (1 minute)

```bash
# Copy template
cp .env.example .env

# Edit and add your key
nano .env
```

Paste your OpenAI API key (from https://platform.openai.com/api-keys):
```
OPENAI_API_KEY=sk-your-key-here
```

## Step 3: Run the App (1 minute)

```bash
# Activate environment (if not already activated)
source .venv/bin/activate

# Run the chat app
python main.py
```

## Step 4: Start Chatting! (2 minutes)

```
================================================================================
Welcome to the AI Chat Application!
================================================================================
Commands:
  - Type your message and press Enter to chat
  - Type 'clear' to clear conversation history
  - Type 'history' to see conversation history
  - Type 'exit' to quit the application
================================================================================

You: What is Python?

AI is thinking...

AI: Python is a high-level, general-purpose programming language known for its
simple and readable syntax...

You: Can you write a simple function?

AI: Of course! Here's a simple Python function that adds two numbers:

def add(a, b):
    return a + b

result = add(5, 3)
print(result)  # Output: 8

You: exit

Thank you for chatting! Goodbye!
```

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| `No module named 'langchain'` | Run: `pip install -r requirements.txt` |
| `OPENAI_API_KEY not found` | Check `.env` file exists and has your key |
| `Connection error` | Check internet connection and API key validity |
| `API error 401` | Your API key is invalid or missing |

## Next Steps

- Read `README.md` for full documentation
- Check `CONFIGURATION.md` for advanced setup
- Explore `llm_service.py` to understand the code
- Customize the system prompt in `llm_service.py`

## Commands in the Chat App

Once running, you can use these commands:

- **`history`** - Show all messages in this conversation
- **`clear`** - Reset conversation history (start fresh)
- **`exit`** - Quit the application
- Just type normally to chat!

## Key Features

✓ Continuous conversation with memory  
✓ Works with gpt-4o-mini for fast & affordable responses  
✓ Maintains chat history  
✓ Clean error handling  
✓ Special commands for managing conversation  

## Get Help

- OpenAI API docs: https://platform.openai.com/docs/guides/gpt
- LangChain docs: https://python.langchain.com/
- OpenAI status: https://status.openai.com/

Enjoy! 🚀

