"""
Chat Application Entry Point
Main script that implements the continuous chat loop
"""

from llm_service import ChatService


def print_welcome_message():
    """Print welcome message and instructions"""
    print("\n" + "="*60)
    print("Welcome to the AI Chat Application!")
    print("="*60)
    print("Commands:")
    print("  - Type your message and press Enter to chat")
    print("  - Type 'clear' to clear conversation history")
    print("  - Type 'history' to see conversation history")
    print("  - Type 'exit' to quit the application")
    print("="*60 + "\n")


def print_response(response: str, speaker: str = "AI"):
    """Print a formatted response"""
    print(f"\n{speaker}: {response}\n")


def display_history(chat_service: ChatService):
    """Display the conversation history"""
    history = chat_service.get_conversation_history()
    if not history:
        print("\n[No conversation history yet]\n")
        return

    print("\n" + "-"*60)
    print("Conversation History:")
    print("-"*60)
    for i, message in enumerate(history, 1):
        role = message.type.upper()
        content = message.content
        print(f"{i}. {role}: {content}")
    print("-"*60 + "\n")


def main():
    """Main chat loop"""
    try:
        # Initialize the chat service
        print("Initializing chat service...")
        chat_service = ChatService(model="gpt-4o-mini")
        print("✓ Chat service initialized successfully!\n")

        # Print welcome message
        print_welcome_message()

        # Main chat loop
        while True:
            try:
                # Get user input
                user_input = input("You: ").strip()

                # Handle empty input
                if not user_input:
                    continue

                # Handle special commands
                if user_input.lower() == "exit":
                    print("\nThank you for chatting! Goodbye!\n")
                    break
                elif user_input.lower() == "clear":
                    chat_service.clear_history()
                    print("\n[Conversation history cleared]\n")
                    continue
                elif user_input.lower() == "history":
                    display_history(chat_service)
                    continue

                # Get AI response
                print("\nAI is thinking...", end="", flush=True)
                response = chat_service.get_response(user_input)
                print("\r" + " "*30 + "\r", end="", flush=True)  # Clear the "thinking" message

                # Display response
                print_response(response, "AI")

            except KeyboardInterrupt:
                print("\n\nChat interrupted by user. Goodbye!\n")
                break
            except Exception as e:
                print(f"\nAn error occurred: {str(e)}\n")
                continue

    except ValueError as e:
        print(f"\nConfiguration Error: {str(e)}")
        print("\nPlease ensure:")
        print("1. You have created a .env file in the project directory")
        print("2. The .env file contains: OPENAI_API_KEY=your_actual_api_key_here")
        print("3. Your API key is valid\n")
    except Exception as e:
        print(f"\nFatal Error: {str(e)}\n")


if __name__ == "__main__":
    main()

