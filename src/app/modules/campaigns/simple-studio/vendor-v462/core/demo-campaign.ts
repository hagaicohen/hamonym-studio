import { blankCampaign } from './campaign-defaults';
export const DEMO_PICTURES: Record<string, string> = {"hero": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzRlODc5MCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTVjMzkyIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZDI4ZTc2Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxwYXRoIGQ9Ik0xNjAgMjY1IEw0NDAgOTAgNzIwIDI2NSBWNDYwIEgxNjBaIiBmaWxsPSIjZmZmOWU5IiBvcGFjaXR5PSIuNjUiLz48cGF0aCBkPSJNMTMwIDI3MCA0NDAgNTggNzUwIDI3MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmNmRkIiBzdHJva2Utd2lkdGg9IjM1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cmVjdCB4PSIzNTQiIHk9IjI4MCIgd2lkdGg9IjE2OSIgaGVpZ2h0PSIxODEiIHJ4PSIzNSIgZmlsbD0iI2JmNzg2MCIvPjxyZWN0IHg9IjIxNSIgeT0iMjk5IiB3aWR0aD0iOTUiIGhlaWdodD0iNzgiIHJ4PSIxOCIgZmlsbD0iIzliYmFiNyIvPjxyZWN0IHg9IjU3MCIgeT0iMjk5IiB3aWR0aD0iOTUiIGhlaWdodD0iNzgiIHJ4PSIxOCIgZmlsbD0iIzliYmFiNyIvPjxjaXJjbGUgY3g9IjM1OCIgY3k9IjM3MCIgcj0iMzQiIGZpbGw9IiNlOWIzOWEiLz48Y2lyY2xlIGN4PSI1MTEiIGN5PSIzNjkiIHI9IjMyIiBmaWxsPSIjZTliMzlhIi8+PHBhdGggZD0iTTMxMCA0NzBRMzIwIDM4OSAzNTkgNDAxUTQwNSA0MTAgNDA4IDQ3MCBNNDY2IDQ3MFE0NzUgNDAwIDUwOCA0MDBRNTU5IDQxMSA1NjcgNDcwIiBmaWxsPSIjNTM2YzY3Ii8+PHBhdGggZD0iTTQwMCAyMzdDNDA1IDIwNiA0NDQgMjA0IDQ1MCAyMzBDNDYwIDIwMCA1MDIgMjEzIDQ5MSAyNDVRNDc1IDI2NyA0NDcgMjkwUTQwNiAyNjQgNDAwIDIzN1oiIGZpbGw9IiNlZjc5N2IiLz48L3N2Zz4=", "story": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzg4YWVhNCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTJjMGEyIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTFiOWFiIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxnPjxjaXJjbGUgY3g9IjI4MCIgY3k9IjIyMyIgcj0iNzAiIGZpbGw9IiNlNWI0OTQiLz48cGF0aCBkPSJNMTU1IDQ2NXEzLTE2NSAxMjUtMTY3IDEyMyA4IDEzMCAxNjciIGZpbGw9IiM0NzdiNzIiLz48cGF0aCBkPSJNMjE0IDE5MnE2LTEwMiA4OS04NiA3MiA2IDQ4IDExOC0zMy0zMC03My0yNC00OCAxMS02NC04IiBmaWxsPSIjNjI0ZTRiIi8+PC9nPjxnPjxjaXJjbGUgY3g9IjU0NSIgY3k9IjIyMSIgcj0iNzUiIGZpbGw9IiNmMGM1YTIiLz48cGF0aCBkPSJNNDEwIDQ2NXE1LTE3NSAxMzUtMTc0IDE0MiA5IDE0NSAxNzQiIGZpbGw9IiNlZWEzNmYiLz48cGF0aCBkPSJNNDgyIDE3N3ExNi0xMDEgMTAwLTc1IDgwIDIxIDQyIDEyNy0yMC01Ni03NC00OC0zNiAxOC02OC00IiBmaWxsPSIjNGM1MzRmIi8+PC9nPjwvc3ZnPg==", "food": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2M0YjY5OCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZThjYTkxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjOGRiYWE0Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMzgiIHJ4PSIyOTIiIHJ5PSIxMjQiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9Ii44NSIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMzIiIHJ4PSIyNDIiIHJ5PSI5MyIgZmlsbD0iI2MwZDZiYyIvPjxlbGxpcHNlIGN4PSI0NDAiIGN5PSIzMjkiIHJ4PSIyMDMiIHJ5PSI2OSIgZmlsbD0iI2U4YTg2YSIvPjxnIGZpbGw9IiM3MzlhNjciPjxjaXJjbGUgY3g9IjM1MCIgY3k9IjMxMyIgcj0iMjEiLz48Y2lyY2xlIGN4PSI0NzciIGN5PSIzNTQiIHI9IjE5Ii8+PGNpcmNsZSBjeD0iNTM1IiBjeT0iMjk2IiByPSIxNyIvPjwvZz48ZyBmaWxsPSIjZjdkODg5Ij48Y2lyY2xlIGN4PSI0MjAiIGN5PSIzMTkiIHI9IjI3Ii8+PGNpcmNsZSBjeD0iNTMwIiBjeT0iMzQyIiByPSIyNCIvPjwvZz48cGF0aCBkPSJNNjcwIDE1NWwtMzAgMTU1bTYxLTE1My0zMCAxNTUiIHN0cm9rZT0iI2VlZTdkNiIgc3Ryb2tlLXdpZHRoPSIxNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+", "team": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzhhYTVhYSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZDdjMGFjIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNmY5NThjIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxnPjxjaXJjbGUgY3g9IjI4MCIgY3k9IjIyMyIgcj0iNzAiIGZpbGw9IiNlNWI0OTQiLz48cGF0aCBkPSJNMTU1IDQ2NXEzLTE2NSAxMjUtMTY3IDEyMyA4IDEzMCAxNjciIGZpbGw9IiM0NzdiNzIiLz48cGF0aCBkPSJNMjE0IDE5MnE2LTEwMiA4OS04NiA3MiA2IDQ4IDExOC0zMy0zMC03My0yNC00OCAxMS02NC04IiBmaWxsPSIjNjI0ZTRiIi8+PC9nPjxnPjxjaXJjbGUgY3g9IjU0NSIgY3k9IjIyMSIgcj0iNzUiIGZpbGw9IiNmMGM1YTIiLz48cGF0aCBkPSJNNDEwIDQ2NXE1LTE3NSAxMzUtMTc0IDE0MiA5IDE0NSAxNzQiIGZpbGw9IiNlZWEzNmYiLz48cGF0aCBkPSJNNDgyIDE3N3ExNi0xMDEgMTAwLTc1IDgwIDIxIDQyIDEyNy0yMC01Ni03NC00OC0zNiAxOC02OC00IiBmaWxsPSIjNGM1MzRmIi8+PC9nPjwvc3ZnPg==", "gift": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2JiOWJiOCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZWNkMGIwIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjODRhOGE1Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxyZWN0IHg9IjIxMCIgeT0iMjE2IiB3aWR0aD0iNDYzIiBoZWlnaHQ9IjIzNSIgcng9IjE3IiBmaWxsPSIjZjJkZmM4Ii8+PHJlY3QgeD0iMTg1IiB5PSIxNzciIHdpZHRoPSI1MTAiIGhlaWdodD0iNjQiIHJ4PSIxNCIgZmlsbD0iI2ZmZjRlMiIvPjxyZWN0IHg9IjQwNCIgeT0iMTc4IiB3aWR0aD0iNzMiIGhlaWdodD0iMjczIiBmaWxsPSIjYTliN2FiIi8+PHBhdGggZD0iTTQ0MiAxNzhRMzAzIDE2OCAzMjEgOThxNDEtODcgMTIxIDgwUTUxNiAxMCA1ODAgODlxMzkgODQtMTM4IDg5WiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYTliN2FiIiBzdHJva2Utd2lkdGg9IjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=", "race": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzkxYjhiYyIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZTRjNWFlIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjN2FhZmE2Ii8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjEzNyIgcj0iNDgiIGZpbGw9IiNmNGNjYWEiLz48cGF0aCBkPSJNNDY0IDE5NyA0MDAgMjgzIDQ4NiAzMTcgNTU4IDI0MiIgc3Ryb2tlPSIjZjRlYmRmIiBzdHJva2Utd2lkdGg9IjQyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJtNDA5IDI3NS0xMzIgMzVtMjA1IDExLTc2IDExMm0xNS0xNTMgODkgODUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQ0NmY3NyIgc3Ryb2tlLXdpZHRoPSIzNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0ibTU1MiAyNDIgOTAgNTUiIHN0cm9rZT0iI2Y0Y2NhYSIgc3Ryb2tlLXdpZHRoPSIyNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTAgNDQyaDg4MCIgc3Ryb2tlPSIjZTllMGM5IiBzdHJva2Utd2lkdGg9IjE0Ii8+PHBhdGggZD0iTTc3IDM4MWgxMDBNMTIwIDMzM2g2NCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIG9wYWNpdHk9Ii42Ii8+PC9zdmc+", "abstract": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4ODAgNDkwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzcyOTg5ZCIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjZGJiNWE4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTZiY2EyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9ImdsIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9Ii42Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmOWVhIiBzdG9wLW9wYWNpdHk9IjAiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iODgwIiBoZWlnaHQ9IjQ5MCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjY4MyIgY3k9IjEwMiIgcj0iMjY2IiBmaWxsPSJ1cmwoI2dsKSIvPjxwYXRoIGQ9Ik04NyA0MjFRMjM4IDE1OSA0MTggMzE5VDgwOCAyNzAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI0NCIgb3BhY2l0eT0iLjQzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSI0NzQiIGN5PSIyMDYiIHI9IjExNSIgZmlsbD0iI2Y2ZGZiMyIgb3BhY2l0eT0iLjgiLz48cGF0aCBkPSJNMCA0NDcgMTgxIDMzMyAzNTYgNDEzIDU1OCAyOTQgODgwIDQ0NyIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjI0Ii8+PC9zdmc+", "avatar1": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Q5ZWNlNiIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNzY5ZDhlIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzRkNDg0NSIvPjwvc3ZnPg==", "avatar2": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Y2ZTNkOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYjc3ODc4Ii8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzcxNTQ1MSIvPjwvc3ZnPg==", "avatar3": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Q3ZGZlYyIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNmM5MGIwIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzM0M2I0NCIvPjwvc3ZnPg==", "avatar4": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Y0ZTZjOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYmQ5MDc4Ii8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzYyNGI0NyIvPjwvc3ZnPg==", "avatar5": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2RjZThkOSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjYTc3ODkxIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzZkNjI1YyIvPjwvc3ZnPg==", "avatar6": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2U0ZTFlZiIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iNzUiIHI9IjM4IiBmaWxsPSIjZjBjMWEwIi8+PHBhdGggZD0iTTE5IDE4MHE5LTcwIDcxLTcwdDcxIDcwIiBmaWxsPSIjNzI4ZGEwIi8+PHBhdGggZD0iTTQ5IDcycTEtNTQgNDUtNDkgNDkgMCA0MCA1Ni0xMy0yMi00MS0yNS0zMyAyMS00NCAxOCIgZmlsbD0iIzU2NDk0YSIvPjwvc3ZnPg=="};
/** The temporary demo fixtures (explicit user action only); every item is marked `demoFixtureV0190`. */
export function seedDemoCampaign(doc:any,kind='donation'){
 const isRace=kind==='race';
 doc.management ||= {};
 doc.management.campaignKind=isRace?'race':'donation';
 doc.management.raceParticipants=[];
 if(!isRace && doc.management.modules?.races)doc.management.modules.races.items=[];

 // Demo campaign URL: populate the mandatory slug field in wizard step 02.
 // Do not overwrite a URL the user has already customized.
 if(!doc.content.share)doc.content.share={};
 const existingDemoSlug=String(doc.content.share.url||'').split(/[?#]/)[0].split('/').filter(Boolean).pop()||'';
 if(!existingDemoSlug||existingDemoSlug==='demo'||existingDemoSlug==='campaign-name'){
   doc.content.share.url='https://hamonym.com/campaign/bayit-ham-layeladim';
 }
 doc.management ||= {};doc.management.modules ||= {};
 doc.management.suppressPreviewGuidanceAfterReset=false;
 const modules=doc.management.modules;
 const c=doc.content;
 if(!c.hero.title)c.hero.title='בית חם לילדים';
 if(!c.hero.orgLogo)c.hero.orgLogo='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgMTYwIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgcng9IjM2IiBmaWxsPSIjZmZmZGY3Ii8+PGNpcmNsZSBjeD0iODAiIGN5PSI4MCIgcj0iNTkiIGZpbGw9IiNmM2VhZDciLz48cGF0aCBkPSJNMzkgNzkgODAgNDNsNDEgMzZ2NDRIMzlaIiBmaWxsPSIjZmZmIiBzdHJva2U9IiMyZTcxNjIiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik02NCAxMjJWOTJhMTYgMTYgMCAwIDEgMzIgMHYzMCIgZmlsbD0iI2VmYzk5MiIvPjxwYXRoIGQ9Ik04MCA3OWMtMTUtMTAtMjEtMjItMTAtMjcgNi0zIDEwIDEgMTAgNCA0LTkgMTctNyAxOCAxIDAgOS0xMCAxNi0xOCAyMloiIGZpbGw9IiNkMTc3NzgiLz48cGF0aCBkPSJNNTUgMTI2aDUwIiBzdHJva2U9IiMyZTcxNjIiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';
 c.hero.showOrgLogo=true;c.hero.logoBelowText=true;
 if(!c.hero.image || c.hero.image===blankCampaign().content.hero.image){c.hero.image=DEMO_PICTURES.hero;c.hero.mediaType='image';c.hero.video='';c.hero.slides=[];}
 if(c.hero.image===DEMO_PICTURES.hero)c.hero.mediaType='image';
 if(!c.hero.subtitle)c.hero.subtitle='אוכל חם, תמיכה ואהבה לכל ילד';
 if(!c.title.title)c.title.title='מעניקים לילדים בית חם';
 if(!c.title.description)c.title.description='עוזרים לילדים ולמשפחות לקבל ארוחה חמה ומעטפת תומכת.';
 // Demo loading restores the manager only when the demo supplies the name.
 // Do not override a deliberate visibility choice on an already configured campaign.
 if(!c.campaignInfo.manager){
  c.campaignInfo.manager='צוות הבית החם';
  c.campaignInfo.showManager=true;
 }
 if(!c.campaignInfo.category)c.campaignInfo.category='קהילה וחברה';
 if(!c.campaignInfo.location)c.campaignInfo.location='ירושלים';
 if(!c.donate.boxAmounts?.some((a:any)=>a.kind!=='recurring'&&Number(a.amount)>0))c.donate.boxAmounts=[
  {amount:100,kind:'once',label:'ארוחה חמה'},
  {amount:180,kind:'once',label:'נותנים באהבה'},
  {amount:360,kind:'once',label:'מעניקים שבוע חם'},
  {amount:1000,kind:'once',label:'שותפים לדרך'}
 ];
 const put=(key:string,items:any[])=>{
  modules[key] ||= {};
  if(!Array.isArray(modules[key].items)||!modules[key].items.length){
    modules[key].items=items.map((item:any,i:number)=>({...item,id:'demo-0190-'+key+'-'+(i+1),demoFixtureV0190:true}));
    modules[key].enabled=true;modules[key].visible=true;
    if(doc.visible[key]===false)doc.visible[key]=true;
  }
 };
 put('donors',[
  {name:'משפחת לוי',photo:DEMO_PICTURES.avatar1,amount:1000,time:'לפני 4 דקות',dedication:'שמחים לעזור לילדים. בהצלחה רבה!',anonymous:false},
  {name:'רחל כהן',photo:DEMO_PICTURES.avatar2,amount:360,time:'לפני 12 דקות',dedication:'שכל ילד ירגיש בבית.',anonymous:false},
  {name:'תורם אנונימי',amount:180,time:'לפני 25 דקות',anonymous:true,dedication:'למען הילדים',dedicationPublic:true},
  {name:'איתי ברק',photo:DEMO_PICTURES.avatar3,amount:500,time:'לפני שעה',dedication:'ביחד נעשה שינוי.',anonymous:false},
  {name:'שרה ואברהם מזרחי',photo:DEMO_PICTURES.avatar4,amount:720,time:'לפני שעתיים',dedication:'מחזקים את הצוות המדהים.',anonymous:false},
  {name:'יעל ישראלי',photo:DEMO_PICTURES.avatar5,amount:100,time:'אתמול',dedication:'תרומה קטנה באהבה גדולה.',anonymous:false},
  {name:'דוד אברהם',photo:DEMO_PICTURES.avatar3,amount:250,time:'אתמול',dedication:'בהצלחה!',anonymous:false},
  {name:'משפחת שלום',photo:DEMO_PICTURES.avatar6,amount:1800,time:'לפני יומיים',dedication:'תודה על כל מה שאתם עושים.',anonymous:false},
  {name:'אורית רוזן',photo:DEMO_PICTURES.avatar1,amount:180,time:'לפני 3 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'משפחת אביטל',photo:DEMO_PICTURES.avatar2,amount:360,time:'לפני 4 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'שמואל לוי',photo:DEMO_PICTURES.avatar3,amount:500,time:'לפני 5 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'דנה שחר',photo:DEMO_PICTURES.avatar4,amount:72,time:'לפני 6 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'אפרת מימון',photo:DEMO_PICTURES.avatar5,amount:1000,time:'לפני 7 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'משפחת קדם',photo:DEMO_PICTURES.avatar6,amount:250,time:'לפני 8 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'איילת ברק',photo:DEMO_PICTURES.avatar1,amount:540,time:'לפני 9 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'ניר כהן',photo:DEMO_PICTURES.avatar2,amount:1200,time:'לפני 10 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'רוני אלון',photo:DEMO_PICTURES.avatar3,amount:180,time:'לפני 11 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false},
  {name:'אורן מזרחי',photo:DEMO_PICTURES.avatar4,amount:420,time:'לפני 12 שעות',dedication:'שמחים להיות חלק מהיוזמה.',anonymous:false}
 ]);
 put('ambassadors',[
  {name:'נועה כהן',target:15000,raised:9300,photo:DEMO_PICTURES.avatar4,url:''},
  {name:'דניאל לוי',target:12000,raised:7850,photo:DEMO_PICTURES.avatar5,url:''},
  {name:'משפחת מזרחי',target:10000,raised:6250,photo:DEMO_PICTURES.avatar1,url:''},
  {name:'יעל ברק',target:8000,raised:3700,photo:DEMO_PICTURES.avatar2,url:''},
  {name:'איתי ישראלי',target:5000,raised:2150,photo:DEMO_PICTURES.avatar3,url:''},
  {name:'רחל אברהם',target:7000,raised:5450,photo:DEMO_PICTURES.avatar6,url:''},
  {name:'תמר לוי',target:8000,raised:4500,photo:DEMO_PICTURES.avatar3,url:''},
  {name:'משפחת נבון',target:10000,raised:6700,photo:DEMO_PICTURES.avatar4,url:''},
  {name:'אורי בן דוד',target:5000,raised:2900,photo:DEMO_PICTURES.avatar5,url:''},
  {name:'מיכל רוזן',target:7500,raised:3800,photo:DEMO_PICTURES.avatar6,url:''},
  {name:'דניאל פלד',target:12000,raised:8500,photo:DEMO_PICTURES.avatar1,url:''},
  {name:'אורית הדר',target:6000,raised:2400,photo:DEMO_PICTURES.avatar2,url:''},
  {name:'משפחת בר',target:10000,raised:9100,photo:DEMO_PICTURES.avatar3,url:''},
  {name:'אלעד צור',target:4000,raised:2500,photo:DEMO_PICTURES.avatar4,url:''},
  {name:'יערה כץ',target:9000,raised:3300,photo:DEMO_PICTURES.avatar5,url:''},
  {name:'נעמי גל',target:7000,raised:4000,photo:DEMO_PICTURES.avatar6,url:''},
  {name:'משפחת רז',target:9000,raised:6300,photo:DEMO_PICTURES.avatar1,url:''},
  {name:'איילה כהן',target:6000,raised:3350,photo:DEMO_PICTURES.avatar2,url:''},
  {name:'יונתן ברק',target:11000,raised:7200,photo:DEMO_PICTURES.avatar3,url:''},
  {name:'משפחת שלו',target:13000,raised:8850,photo:DEMO_PICTURES.avatar4,url:''},
  {name:'מאיה רון',target:8000,raised:4600,photo:DEMO_PICTURES.avatar5,url:''},
  {name:'אלון שרון',target:5000,raised:2050,photo:DEMO_PICTURES.avatar6,url:''},
  {name:'שירה פרידמן',target:12000,raised:9800,photo:DEMO_PICTURES.avatar1,url:''},
  {name:'משפחת אדרי',target:7000,raised:4100,photo:DEMO_PICTURES.avatar2,url:''},
  {name:'רותם קדם',target:10000,raised:5900,photo:DEMO_PICTURES.avatar3,url:''},
  {name:'יובל לוי',target:8500,raised:5100,photo:DEMO_PICTURES.avatar4,url:''}
 ]);
 // Add the extra fixture ambassadors to already-seeded demo campaigns, never to real campaigns.
 if(Array.isArray(modules.ambassadors.items)&&modules.ambassadors.items.length>=16&&modules.ambassadors.items.every((x:any)=>x.demoFixtureV0190)){
  const newNames=['משפחת רז','איילה כהן','יונתן ברק','משפחת שלו','מאיה רון','אלון שרון','שירה פרידמן','משפחת אדרי','רותם קדם','יובל לוי'];
  const existing=new Set(modules.ambassadors.items.map((x:any)=>x.name));
  const extras=[
   [9000,6300,1],[6000,3350,2],[11000,7200,3],[13000,8850,4],[8000,4600,5],
   [5000,2050,6],[12000,9800,1],[7000,4100,2],[10000,5900,3],[8500,5100,4]
  ];
  newNames.forEach((name,i)=>{if(!existing.has(name)){const [target,raised,avatar]=extras[i];modules.ambassadors.items.push({id:'demo-0190-ambassadors-extra-'+(i+1),name,target,raised,photo:DEMO_PICTURES['avatar'+avatar],url:'',demoFixtureV0190:true});}});
 }

 if(modules.ambassadors.items?.some((x:any)=>x.demoFixtureV0190))modules.ambassadors.publicAmounts=true;
 put('updates',[
  {title:'היוזמה יצאה לדרך',text:'בזכות עשרות שותפים נרגשים פתחנו את הקמפיין. היעד שלנו הוא לתת לכל ילד ארוחה חמה, תחושת שייכות ומעטפת אוהבת.',date:'2026-11-15',status:'published',pinned:true,image:DEMO_PICTURES.hero},
  {title:'כבר מאות ארוחות חמות',text:'הצוות והמתנדבים חילקו ארוחות חמות ומזינות. תודה לכל מי שבישל, ארז והגיע לעזור.',date:'2026-11-12',status:'published',pinned:false,image:DEMO_PICTURES.food},
  {title:'פותחים שבוע של נתינה',text:'השבוע הצטרפו שגרירים חדשים ואנו ממשיכים להרחיב את מעגל התומכים.',date:'2026-11-09',status:'published',pinned:false,image:DEMO_PICTURES.team}
 ]);
 put('races',[
  {title:'רצים למען הילדים',desc:'מסלול קהילתי של 5 ק״מ למען פעילות הבית החם.',date:'2026-12-18',price:60,capacity:150,registered:48,status:'open',image:DEMO_PICTURES.race},
  {title:'צועדים ביחד',desc:'מסלול הליכה משפחתי של 2 ק״מ, מתאים לכל הגילים.',date:'2026-12-18',price:30,capacity:250,registered:102,status:'open',image:DEMO_PICTURES.race}
 ]);
 put('comments',[
  {name:'מיכל לוי',text:'יוזמה מבורכת. כל הכבוד למתנדבים!',date:'2026-11-16',approved:true},
  {name:'יוסי אברהם',text:'שמח להיות שותף למטרה הזו.',date:'2026-11-15',approved:true},
  {name:'עדי רוזן',text:'בהצלחה גדולה! מחזקת את ידיכם.',date:'2026-11-14',approved:true}
 ]);
 put('sponsors',[
  {name:'חברים למען הקהילה',logo:DEMO_PICTURES.gift,description:'שותפים מרכזיים',url:''},
  {name:'עסקים עם לב',logo:DEMO_PICTURES.abstract,description:'נותני חסות',url:''},
  {name:'יחד למען הילדים',logo:DEMO_PICTURES.home||DEMO_PICTURES.hero,description:'שותפים לדרך',url:''},
  {name:'לב פתוח',logo:DEMO_PICTURES.gift,description:'שותפים בקהילה',url:''},
  {name:'חברים לעשייה',logo:DEMO_PICTURES.abstract,description:'שותפים בקהילה',url:''},
  {name:'בית של תקווה',logo:DEMO_PICTURES.hero,description:'שותפים בקהילה',url:''},
  {name:'קהילה תומכת',logo:DEMO_PICTURES.food,description:'שותפים בקהילה',url:''},
  {name:'כוח הנתינה',logo:DEMO_PICTURES.team,description:'שותפים בקהילה',url:''},
  {name:'עושים טוב יחד',logo:DEMO_PICTURES.gift,description:'שותפים בקהילה',url:''},
  {name:'מרכז החסד',logo:DEMO_PICTURES.abstract,description:'שותפים בקהילה',url:''},
  {name:'מעגל הלב',logo:DEMO_PICTURES.hero,description:'שותפים בקהילה',url:''},
  {name:'שבילי קהילה',logo:DEMO_PICTURES.food,description:'שותפים בקהילה',url:''},
  {name:'שותפות לצמיחה',logo:DEMO_PICTURES.team,description:'שותפים בקהילה',url:''}
 ]);
 if(!Array.isArray(doc.content.rewards.items)||!doc.content.rewards.items.length){
  doc.content.rewards.items=[
   {name:'תודה מכל הלב',description:'מכתב תודה אישי מהצוות.',amount:100,recommended:false,stockEnabled:false,image:DEMO_PICTURES.gift,demoFixtureV0190:true},
   {name:'שותפים לארוחה חמה',description:'תעודת הוקרה דיגיטלית מעוצבת.',amount:250,recommended:true,stockEnabled:false,image:DEMO_PICTURES.gift,demoFixtureV0190:true},
   {name:'מעגל החברים',description:'הוקרה מיוחדת לשותפים המשמעותיים.',amount:500,recommended:false,stockEnabled:false,image:DEMO_PICTURES.gift,demoFixtureV0190:true},
   {name:'שותפי זהב',description:'תעודת תודה מיוחדת והזמנה למפגש הפעילים.',amount:1200,recommended:false,stockEnabled:true,quantity:25,image:DEMO_PICTURES.gift,demoFixtureV0190:true}
  ];doc.visible.rewards=true;
 }
 if(!doc.content.story.blocks?.length){
  doc.content.story.blocks=[
   {id:'demo-0190-story-intro',type:'text',value:'<h2>בית חם מתחיל בלב פתוח</h2><p>יש ילדים שעבורם ארוחה חמה אינה מובנת מאליה. בכל יום, מתנדבים פותחים את הלב ומביאים אוכל מזין, יחס אישי ותחושה של בית לילדים הזקוקים לכך.</p><p>הקמפיין נועד להרחיב את פעילות החלוקה ולוודא שגם ביום עמוס, ובכל מזג אוויר, אף ילד לא יישאר בלי מענה.</p>',children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-photo',type:'image',value:DEMO_PICTURES.story,children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-more',type:'text',value:'<h2>מה התרומה שלכם מאפשרת?</h2><p>בזכות השותפות נוכל לרכוש מוצרי מזון טריים, להכין מנות חמות, להרחיב את מערך המתנדבים ולסייע למשפחות בהתמדה לאורך השנה.</p><p>אנחנו מאמינים שהשינוי הגדול מתחיל במעשים פשוטים: צלחת מלאה, חיוך חם והידיעה שיש מי שחושב עליך.</p><p>כל תרומה, קטנה כגדולה, נותנת לנו כוח להגיע לעוד ילד ולעוד משפחה.</p>',children:[],demoFixtureV0190:true},
   {id:'demo-0190-story-outro',type:'text',value:'<h2>ביחד יוצרים עתיד טוב יותר</h2><p>עזרו לנו להמשיך במפעל החסד הזה. כל שיתוף, תרומה או הצטרפות כשגרירים מחזקים את מעגל הנתינה. תודה שאתם חלק מהסיפור.</p>',children:[],demoFixtureV0190:true}
  ];
  doc.content.story.heading ||= 'הסיפור שלנו';
  doc.visible.story=true;
 }
 if(!(Number(doc.content.stats.goal)>0))doc.content.stats.goal=150000;
 if(!(Number(doc.content.stats.raised)>0))doc.content.stats.raised=68540;
 if(!(Number(doc.content.stats.donors)>0))doc.content.stats.donors=324;
 if(!isRace){
   doc.management.modules.races.items=[];
   doc.visible.races=false;
 }else{
   doc.visible.races=true;
   doc.management.modules.races.enabled=true;
   doc.management.modules.races.visible=true;
   // Rich but clearly fictional fixture: three real-looking heats and sample participants.
   doc.management.modules.races.items=[
     {id:'demo-race-2km',title:'מקצה משפחות',desc:'מסלול משפחתי נוח, מתאים להורים ולילדים.',distance:'2 ק״מ',date:'2026-12-18',place:'פארק העיר',price:40,start:'09:00',capacity:200,status:'open',registered:86,minAge:0,demoFixtureV0190:true},
     {id:'demo-race-5km',title:'מקצה עממי',desc:'ריצה קהילתית בקצב חופשי למען הילדים.',distance:'5 ק״מ',date:'2026-12-18',place:'פארק העיר',price:80,start:'08:15',capacity:250,status:'open',registered:174,minAge:12,demoFixtureV0190:true},
     {id:'demo-race-10km',title:'מקצה תחרותי',desc:'מקצה מדוד לרצים מנוסים, עם נקודות מים.',distance:'10 ק״מ',date:'2026-12-18',place:'פארק העיר',price:120,start:'07:30',capacity:180,status:'open',registered:119,minAge:16,demoFixtureV0190:true}
   ];
   const sampleNames=['נועה לוי','איתי כהן','מאיה ישראלי','יואב רז','דנה רוזן','אורי בן דוד','רוני הדר','מיכל ברק','עמית מזרחי','תמר פרידמן','אלון שחר','יעל אברהם','עידו קפלן','שירה נבון','איתן לוין','הדר פלד','גיא אשכנזי','נטע ארז'];
   doc.management.raceParticipants=sampleNames.map((name,i)=>({name,heat:i%3,age:[9,32,25,41,17,38,24,30,16,29,37,23,42,26,35,28,19,33][i],demo:true,demoFixtureV0190:true}));
   c.hero.title='רצים למען הילדים';
   c.hero.subtitle='מירוץ קהילתי למען עתיד טוב יותר';
   c.title.title='רצים יחד, תורמים יחד';
   c.title.description='מירוץ קהילתי המשלב הרשמה למקצים ותמיכה בילדים';
 }
 doc.management.demoFixtureSeedV0190=true;
}
