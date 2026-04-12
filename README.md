# AI Chat Application

A Python chat application built with LangChain and OpenAI API that maintains conversation history and provides intelligent responses.

## Features

✓ Uses ChatOpenAI from LangChain for intelligent responses  
✓ Loads API key securely from `.env` file  
✓ Maintains conversation history (memory)  
✓ Uses customizable prompt templates  
✓ Continuous chat loop with special commands  
✓ Clean and modular code structure  
✓ Graceful error handling  

## Project Structure

```
demo/
├── main.py                 # Entry point with chat loop
├── llm_service.py         # LLM service and business logic
├── requirements.txt       # Python dependencies
├── .env.example          # Example environment configuration
└── .env                  # Your actual configuration (create from .env.example)
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd /Users/chandankumar/Desktop/workspace/ai-engineer/demo
pip install -r requirements.txt
```

### 2. Configure API Key

Create a `.env` file in the `demo` directory:

```bash
cp .env.example .env
```

Then edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=your_actual_openai_api_key_here
```

Get your API key from: https://platform.openai.com/api-keys

### 3. Run the Application

```bash
python main.py
```

## Usage

Once the application starts, you can:

- **Chat**: Simply type your message and press Enter
- **View History**: Type `history` to see the conversation
- **Clear History**: Type `clear` to reset the conversation
- **Exit**: Type `exit` to quit the application

### Example Interaction

```
You: Hello, how are you?

AI: I'm doing well, thank you for asking! I'm here to help with any questions or tasks you might have. How can I assist you today?

You: What is Python?

AI: Python is a high-level, interpreted programming language known for its simplicity and readability...
```

## Configuration

### Model Selection

The application uses `gpt-4o-mini` by default, but you can change it by modifying the model parameter in `main.py`:

```python
chat_service = ChatService(model="gpt-4o-mini")  # Change this model name
```

### Prompt Template

You can customize the system prompt in `llm_service.py` by modifying the `prompt_template`:

```python
self.prompt_template = ChatPromptTemplate.from_messages([
    ("system", "Your custom system prompt here"),
    ("human", "{input}")
])
```

## Code Architecture

### `llm_service.py`
- **ChatService class**: Manages all LangChain and OpenAI interactions
- Handles API initialization, prompt templating, and conversation history
- Provides methods: `get_response()`, `get_conversation_history()`, `clear_history()`

### `main.py`
- **Chat Loop**: Handles user input and command processing
- **Special Commands**: exit, clear, history
- **Error Handling**: Graceful handling of API and configuration errors
- **User Interface**: Formatted output and welcome messages

## Requirements

- Python 3.8+
- OpenAI API key (free trial available)
- Internet connection for API calls

## Dependencies

- **langchain**: LLM framework
- **langchain-openai**: OpenAI integration
- **langchain-community**: Community utilities
- **python-dotenv**: Environment variable management
- **openai**: Official OpenAI Python library

## Troubleshooting

### API Key Not Found
- Ensure `.env` file exists in the `demo` directory
- Verify the file contains `OPENAI_API_KEY=your_key`
- Check that your API key is valid

### Import Errors
- Run `pip install -r requirements.txt` again
- Ensure you're using Python 3.8 or higher

### API Errors
- Check your internet connection
- Verify your OpenAI API key is valid
- Check your OpenAI account balance/quota

## License

This is a demo application for educational purposes.

## Author

Created as an AI Engineer demo application.

