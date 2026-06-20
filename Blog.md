# DAU Pulse: From Chaos to Clarity

## The "Aha!" Moment
Have you ever noticed how campus problems are reported? Someone spots a broken projector, so they mention it to their class rep. The class rep emails the professor. The professor forgets. Meanwhile, three other students complain about the exact same projector in a random WhatsApp group, hoping someone with authority magically sees it. 

The result? The administration is completely blind to recurring issues, students feel ignored, and minor problems (like a leaking pipe) escalate into massive damages before the right person even hears about it.

During the AI Club Buildathon, we realized something crucial: **100% of students use WhatsApp.** 
If we wanted to fix campus reporting, we couldn't ask students to download *yet another* app or fill out a clunky Google Form. We had to meet them where they already were.

That was the birth of **DAU Pulse**.

## The Engineering Journey

Building DAU Pulse wasn't just about connecting a chatbot; it was about building an intelligent triage system. 

### 1. Removing the Friction
We started by integrating the **Meta WhatsApp Cloud API**. We wanted the user experience to be invisible. A student simply texts our bot: *"The Wi-Fi on the 2nd floor of the library is dead."* That’s it. No drop-down menus, no category selection.

### 2. Enter the AI Brain
To make this work without forms, we needed to extract structured data from unstructured text. We integrated **Google Gemini 2.5 Flash**. Within milliseconds of receiving a WhatsApp message, Gemini processes the natural language and extracts the department (Tech Support), the sub-category (Wi-Fi Down), the location (Library), and assigns an urgency score (4/5 because it impacts a large area).

If the student forgets to mention a location, the bot automatically texts them back: *"Got it! Could you tell us exactly where on campus this is happening?"*

### 3. Solving the "Duplicate" Nightmare
The hardest technical challenge wasn't categorization; it was **clustering**. If 50 students report the cafeteria food being bad, the admin dashboard shouldn't show 50 identical tickets. 

We built a custom clustering algorithm in our Next.js backend that compares incoming reports to active clusters. If the location, sub-category, and keyword overlap matches, it silently groups the reports together and increments a `reportCount`. Suddenly, the admin sees ONE ticket that says *"Cafeteria Food Quality - Affecting Main Cafeteria - 50 Reports"*.

## The Impact
With DAU Pulse, we are shifting campus administration from **reactive to proactive**. 

Administrators no longer sift through hundreds of overlapping emails. They open a sleek, Next.js-powered dashboard backed by Vercel KV, look at the highest urgency red badges, and know exactly where to send their teams.

And the students? They just send a text, and watch their campus get better. 
