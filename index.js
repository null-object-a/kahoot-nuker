#! /usr/bin/node
const readline = require('readline');
const minimist = require('minimist');
const chalk = require('chalk');
const kahooteer = require('kahooteer');
const namerator = require('kahooteer/src/lib/namerator');

if (!String.prototype.format) {
	String.prototype.format = function() {
		var args = arguments;
		return this.replace(/{(\d+)}/g, function(match, number) {
			return typeof args[number] != 'undefined'
			? args[number]
			: match;
		});
	};
}

const Arguments = minimist(process.argv);

const Configuration = {
	BotAmount: (Arguments.amount || Arguments.a || 10) - 1,
	GamePin: (Arguments.pin || Arguments.p).toString(),
}

var ReadLineInterface = undefined;

const Players = new Map();

const RegularBotNames = namerator.bulk(Configuration.BotAmount);

const GenerateMainBotName = () => `balls-${namerator().substring(5)}`;

const MainBotName = GenerateMainBotName();

const MainBot = new kahooteer(Configuration.GamePin, MainBotName);

//MainBot.verbose = true;

async function OnJoin() {
	console.log(chalk.whiteBright(`${chalk.greenBright('[✓]')} Main bot has successfully joined the game, playing as '${MainBot.PlayerName}'`));

	MainBot.on('left', OnLeft);

	MainBot.on('question', OnQuestion);

	ReadLineInterface = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	for (var Index = 0; Index < Configuration.BotAmount; Index++) {
		const SelectedName = RegularBotNames.pop();
		const Client = new kahooteer(Configuration.GamePin, SelectedName);
		Players.set(Client.Identifier, Client);
	}

	Configuration.BotAmount - 1 !== 0 ? console.log(`${chalk.cyanBright('[OK]')} Scheduling join for ${chalk.yellowBright(Configuration.BotAmount)} bots.`) : undefined;

	const PlayerArray = Array.from(Players.values());

	for (var Index = 0; Index < Configuration.BotAmount; Index++) {
		const Player = PlayerArray.pop();

		setImmediate(
			() => Player.Join()
		);
	}
}

function OnJoinFailed(Reason) {
	return console.log(chalk.whiteBright(`${chalk.redBright('[✗]')} Main bot couldn't join the game due to: '${Reason}'`));
}

function OnQuestion(Question) {
	const PlayerArray = Array.from(Players.values());
	const PossibleAnswers = ['red', 'blue', 'yellow', 'green'];

	function FormatChoices(Choices) {
		const Strings = [];
		var LongestSpacing = 1;
		var LongestSemicolonSpacing = 1;

		Choices.forEach((Choice, Index) => {
			Strings.push(`${PossibleAnswers[Index]}{0}::{1}'${Choice.answer}'`);
			const CurrentSpacing = PossibleAnswers[Index].length;
			const CurrentSemicolonSpacing = PossibleAnswers[Index].length;

			CurrentSpacing > LongestSpacing ? LongestSpacing = CurrentSpacing : undefined;
			CurrentSemicolonSpacing > LongestSemicolonSpacing ? LongestSemicolonSpacing = CurrentSemicolonSpacing : undefined;
		});

		Strings.forEach((string, Index) => {
			const [ASpacing, BSPacing] = [LongestSemicolonSpacing - (`${PossibleAnswers[Index]}`.length), LongestSpacing - (`${PossibleAnswers[Index]}:`.length)];
			Strings[Index] = string.format(' '.repeat(ASpacing + 1), ' '.repeat(ASpacing - BSPacing));
		})

		return Strings.join('\n\t');
	}

	function PrettifyTitle(Title) {
		const words_per_line = 8;
		const words = Title.split(/[ ]+/);
		const lines = [];

		for (let Index = 0; Index < words.length; Index += words_per_line) lines.push(words.slice(Index, Index + words_per_line).join(' '));

		return lines.join(`\n${' '.repeat(5)}`)
	}

	function Answer(choice) {
		for (var Index = 0; Index < Configuration.BotAmount; Index++) {
			const Player = PlayerArray.pop();
	
			if (Player.LoggedIn) {
				setTimeout(
					() =>	Player.Send(
								'controller',
								{
									content: JSON.stringify({
										type: Question.Type,
										choice,
										questionIndex: Question.Index,
										meta: {
											lag: Math.round(Math.random() * 45 + 5)
										}
									}),
									id: 45,
									type: 'message'
								}
							),
					Math.ceil(Math.random() * 60) * 100
				)
			}
		}
	}

	Promise.race([
		new Promise(
			(resolve) => ReadLineInterface.question(`${chalk.yellowBright('[?] ')}${Question.Title ? `'${PrettifyTitle(Question.Title)}'` : `'?'`} ${Question.Choices ? `\n${' '.repeat(4)}Avaiable choices:\n\t${FormatChoices(Question.Choices)}\n> ` : '{(r)ed, (b)lue, (y)ellow, (g)reen}:'}`, resolve)
		),
		new Promise(
			(_, reject) => setTimeout(reject, Question.TimeLeft - 800)
		)
	])
	.then(
		(AnswerString) => {
			const Pieces = AnswerString.split(/[ ]+/);


			var Answers = Pieces.map(Piece => PossibleAnswers.findIndex(Answer => Answer.startsWith(Piece.toLowerCase())));

			Answers = Answers.slice(0, Question.AnswersAllowedCount);

			if (Question.AnswersAllowedCount === 1) Answers = Answers.pop();

			setImmediate(Answer, Answers);

			Question.Answer(Answers)
				.then(
					(Correct) => console.log(Correct ? chalk.whiteBright(`${chalk.greenBright('[✓]')} Answered correctly!`) : chalk.whiteBright(`${chalk.redBright('[✗]')} Answered incorrectly :(`))
				)
				.catch(
					() => console.log(chalk.redBright(`${chalk.red('[✗]')} Failed to answer question.`))
				);

			
		}
	)
	.catch(
		(err) => {
			console.log(chalk.whiteBright(`\n${chalk.redBright('[✗]')} Question timed out, left unanswered.`));
			ReadLineInterface.close();
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			ReadLineInterface = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
		}
	)
}

function OnLeft(Reason) {
	console.log(chalk.whiteBright(`${chalk.redBright('[✗]')} Main bot was kicked off the game due to: '${Reason}'`))

	if (['Player not found', 'game_end'].includes(Reason)) return;

	MainBot.PlayerName = GenerateMainBotName();

	MainBot.Join()
		.then(
			OnJoin
		)
		.catch(
			OnJoinFailed
		);
};

MainBot.Join()
	.then(
		OnJoin
	)
	.catch(
		OnJoinFailed
	);