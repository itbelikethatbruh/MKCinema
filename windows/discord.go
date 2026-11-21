package main

// Discord Rich Presence lives in package discord (named pipe here, a Unix socket on Mac and Linux).

import "mkcinema/discord"

// MKCinema's Discord application (public id). Override with -ldflags "-X main.discordAppID=<id>"; empty turns presence off.
var discordAppID = "1567818702479425586"

func init() { discord.AppID = discordAppID }

func parseActivity(raw string) (discord.Activity, error) { return discord.Parse(raw) }
func presenceSet(a discord.Activity) bool                { return discord.Set(a) }
func presenceClear()                                     { discord.Clear() }
