# Configuration Guide

## Quick Start

### 1. Setup Virtual Environment

```bash
# Make the setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

OR manually:

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# OR
.venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure API Key

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file and add your OpenAI API key
nano .env  # or use your preferred editor
```

Add your API key:
```
OPENAI_API_KEY=sk-...your-actual-key...
```

### 3. Run the Application

```bash
python main.py
```

## Getting an OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in with your OpenAI account (or create one)
3. Click "Create new secret key"
4. Copy the key and paste it in your `.env` file
5. Keep your key secret - never commit it to version control

## Environment Variables

### Required Variables

- `OPENAI_API_KEY`: Your OpenAI API key (starts with `sk-`)

### Optional Variables

You can customize the application by adding these to your `.env` file:

```
# Model to use (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Temperature for responses (0-2, default: 0.7)
# Higher values = more random, Lower values = more focused
OPENAI_TEMPERATURE=0.7
```

## Troubleshooting

### "OPENAI_API_KEY not found"
- Check that `.env` file exists in the demo directory
- Verify the file is named exactly `.env` (not `.env.txt`)
- Make sure it contains: `OPENAI_API_KEY=your_key_here`
- Restart the application after updating `.env`

### "No module named 'langchain'"
- Ensure virtual environment is activated
- Run: `pip install -r requirements.txt`
- Check that the installation completed without errors

### "Connection error" or "API error"
- Verify your internet connection
- Check that your API key is valid and not expired
- Ensure your OpenAI account has available credits
- Check your usage at: https://platform.openai.com/account/usage/overview

### Application hangs or is slow
- The first response may take a few seconds
- Check your internet connection
- Verify OpenAI API status: https://status.openai.com

## File Structure Explained

```
demo/
├── main.py              # Entry point - contains the chat loop
├── llm_service.py       # Service layer - handles all LangChain logic
├── requirements.txt     # Python package dependencies
├── .env.example        # Template for environment configuration
├── .env                # Your actual configuration (DO NOT COMMIT)
├── .gitignore          # Git ignore rules
├── README.md           # Main documentation
├── CONFIGURATION.md    # This file
└── setup.sh            # Automated setup script
```

## Advanced Configuration

### Custom System Prompt

Edit `llm_service.py` and modify the `prompt_template`:

```python
self.prompt_template = ChatPromptTemplate.from_messages([
    ("system", "You are an expert Python developer. Always provide code examples."),
    ("human", "{input}")
])
```

### Different Models

Change the model in `main.py`:

```python
# Use GPT-4 Turbo instead
chat_service = ChatService(model="gpt-4-turbo")

# Or GPT-3.5 Turbo for cheaper option
chat_service = ChatService(model="gpt-3.5-turbo")
```

Available models:
- `gpt-4-turbo` - Most powerful, best quality
- `gpt-4o` - Balanced, faster
- `gpt-4o-mini` - Fast, cheaper (default)
- `gpt-3.5-turbo` - Affordable option

### Adjust Response Temperature

In `llm_service.py`, modify the `ChatOpenAI` initialization:

```python
self.llm = ChatOpenAI(
    model=model,
    api_key=api_key,
    temperature=1.5  # Range: 0-2. Higher = more creative
)
```

## Best Practices

1. **Security**
   - Never commit `.env` file to git
   - Never share your API key
   - Use `.env.example` as a template only

2. **Cost Management**
   - Monitor your usage at https://platform.openai.com/account/usage
   - Use `gpt-4o-mini` for cost-effective usage
   - Clear conversation history if it gets too long

3. **Performance**
   - First response may be slower due to API initialization
   - Subsequent responses are faster
   - Long conversation histories may affect response time

4. **Error Handling**
   - The app handles network errors gracefully
   - Invalid API keys are caught at startup
   - Server errors are reported with details

## Support

For issues:
1. Check this documentation first
2. Verify your API key is valid
3. Check OpenAI API status
4. Review the error messages carefully

Common error codes:
- `401`: Invalid or missing API key
- `429`: Rate limit exceeded
- `500`: OpenAI server error (temporary)
- `503`: OpenAI service unavailable

Need help? Contact OpenAI support at https://help.openai.com

