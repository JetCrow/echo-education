# ECHO MVP

## Goal

Build the smallest possible browser prototype of an AI assistant for a real school teacher.

The first use case is **Мистецтво / Art**.

The teacher continues to teach the normal lesson. ECHO is used **after the lesson** for:

- homework as a guided conversation;
- practical follow-up activities;
- revisiting something the student did not understand;
- short spoken practice with an AI assistant that follows the teacher's pedagogical style.

## Product hypothesis

Children already use general-purpose AI for homework.

Instead of trying to prevent this, ECHO should turn AI use into a learning interaction where the student must observe, answer, explain, compare, and do something practical rather than simply copy a generated answer.

## MVP user experience

1. Student opens a web page.
2. Student presses **Почати**.
3. Browser requests microphone access.
4. A stylized AI teacher-assistant starts a realtime voice conversation.
5. The AI stays strictly within the role of an art teacher assistant.
6. The student can interrupt naturally.
7. The UI shows a simple avatar state:
   - idle
   - listening
   - speaking
8. Student can mute or end the session.

## Required in MVP

- Next.js web app
- desktop + mobile browser support
- Ukrainian interface
- realtime voice conversation
- microphone input
- voice output
- clear AI identity
- simple stylized avatar
- Start / Mute / End controls
- strict teacher-role prompt
- short conversational responses
- natural turn-taking and interruption

## Explicitly out of scope

Do **not** add any of the following unless a later task explicitly requests it:

- camera
- image analysis
- authentication
- database
- profiles
- memory between sessions
- assignments system
- curriculum engine
- teacher dashboard
- parent dashboard
- analytics
- classroom management
- grading
- notifications
- gamification
- avatars marketplace
- multiple subjects
- multiple teachers
- payments

## First validation question

Can a child have a natural 10–15 minute spoken interaction with the AI assistant and perceive it as a useful continuation of the real teacher's lesson?

## Success criteria for first prototype

The prototype is successful enough to continue if:

- conversation starts reliably;
- latency is acceptable;
- the child can interrupt the AI;
- the AI does not give long lectures;
- the AI stays in the art-teacher role;
- the child voluntarily continues the conversation for several minutes;
- the child can understand that this is an AI assistant, not the real teacher.
