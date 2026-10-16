# Lilac 💜

**Your UCL week, made lighter.**

A voice-first student-life copilot for UCL students, built with Claude for the Claude Campus Hackathon (track: Better Student Life).

Tell it what's stressing you out. It reads your timetable and Moodle deadlines, plans your week, turns voice rants into tasks, and makes sense of your spending.

## Features
- **Week planner**: import your UCL timetable and Moodle calendar (.ics); Claude schedules study blocks around classes and deadlines.
- **Voice brain-dump**: speak (Chrome/Edge) or type; Claude extracts prioritised tasks.
- **Budget**: upload a Revolut/bank CSV; Claude categorises spending and gives student-specific insights. Parsed in-browser; only merchant text and amounts are sent.
- **Club events**: tick your societies to see what's on, with free food flagged (sample data).
- **Private by design**: no accounts, no database, data stays in your browser.

## Run it
Requires Node 20.12+. No dependencies.

```bash
cp .env.example .env     # then paste your ANTHROPIC_API_KEY (optional)
npm start
```
Open http://localhost:3000. Without a key it runs in **mock mode** with canned responses.
Click Setup → Load sample data to try it instantly.

## Getting your data in
- Timetable: https://timetable.ucl.ac.uk/custom → export the .ics
- Moodle: Calendar → Export calendar → download the .ics
- Bank: export a CSV statement (Revolut: Statements → CSV)

## Next steps
Live Open Banking sync, push notifications for deadlines, lecture recording → transcript → flashcards, real SU events feed.
