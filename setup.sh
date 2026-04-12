#!/bin/bash

# Setup script for the AI Chat Application
# This script will help you set up the application for the first time

echo "================================"
echo "AI Chat Application Setup"
echo "================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"
echo ""

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

echo ""
echo "Activating virtual environment..."
source .venv/bin/activate

echo "✓ Virtual environment activated"
echo ""

# Install requirements
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "================================"
echo "Setup Instructions"
echo "================================"
echo ""
echo "1. Create .env file:"
echo "   cp .env.example .env"
echo ""
echo "2. Edit .env and add your OpenAI API key:"
echo "   nano .env"
echo ""
echo "3. Run the application:"
echo "   python main.py"
echo ""
echo "Get your OpenAI API key at: https://platform.openai.com/api-keys"
echo ""
echo "Setup complete! 🎉"

