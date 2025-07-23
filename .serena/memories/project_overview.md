# Voice Assistant Backend Project Overview

## Purpose
A comprehensive Node.js/Express backend for a voice assistant application that integrates with Apple ecosystem apps (iPhone/Apple Watch) and web clients. It replaces N8N workflows with proper LangChain agents for intelligent voice command processing.

## Core Features
- Voice command processing with speech-to-text and text-to-speech
- AI-powered responses using LangChain agents with GPT-4 and Claude
- Real-time communication via WebSocket
- Authentication for Apple and Google users
- Integration with calendar, email, and task management services
- Queue-based background job processing

## Deployment
- Platform: Railway (cloud hosting)
- Process Manager: PM2 for production
- CI/CD: Railway automatic deployments
- Database: PostgreSQL (Railway managed)
- Cache/Queue: Redis (Railway managed)