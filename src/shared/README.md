# src/shared

Code used by both the server and the web app: request and response schemas, money and date helpers, and every fixed list of values (such as order statuses), each defined once here.

Shared code imports from neither `src/server` nor `src/web`. The lint rule enforces this.
