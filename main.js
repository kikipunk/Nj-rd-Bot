const { Client, Util} = require('discord.js');
const Discord = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

const adapters = new FileSync('database.json');
const db = low(adapters);
db.defaults({nbmsg: []}).write()
var dice;

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready',() => {
	client.user.setPresence({status: 'idle', game: { name: 'le chat', type: 3} });
    console.log('Njörd var her!');
});

client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting',() => {
	console.log('I am reconnecting now!');
	client.user.setPresence({status: "dnd", game: { name: 'ERROR', type: 3} });
});

client.on('message', async message => { 

	if (message.author.bot) return undefined;

	var msgauthor = message.author.id;
	var msgauthoru = message.author.username;
	var msgserv = message.guild.id

	if (!db.get("nbmsg").find({user: msgauthor, guild: msgserv}).value()){
        db.get("nbmsg").push({user: msgauthor, guild: msgserv, nbmsg: 1}).write();
    }else{
        var usernbmsgdb = db.get("nbmsg").filter({user: msgauthor, guild: msgserv}).find('nbmsg').value();
        var usernbmsg = Object.values(usernbmsgdb)

        db.get("nbmsg").find({user: msgauthor, guild: msgserv}).assign({user: msgauthor, guild: msgserv, nbmsg: usernbmsg[2] += 1}).write();
    }

	if (!message.content.startsWith(PREFIX)) return undefined;

	const args = message.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(message.guild.id);

	let command = message.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'play' || command === 'p') {
		const voiceChannel = message.member.voiceChannel;
		if (!voiceChannel) return message.channel.send('Vous devez être dans un channel vocal pour écouté de la musique!');
		const permissions = voiceChannel.permissionsFor(message.client.user);
		if (!permissions.has('CONNECT')) {
			return message.channel.send('Je ne peu pas rejoindre le channel vocal, vérifier les permitions!');
		}
		if (!permissions.has('SPEAK')) {
			return message.channel.send('Je ne peu pas parler dans ce channel, vérifier les permitions!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id);
				await handleVideo(video2, message, voiceChannel, true);
			}
			return message.channel.send(`✅ Playlist: **${playlist.title}** à été ajouter a la liste de lecture!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					message.channel.send(`
__**Selection de chansson:**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
Veuillez indiquer une valeur pour sélectionner l'un des résultats de recherche compris entre 1 et 10.
					`);
					try {
						var response = await message.channel.awaitMessages(message2 => message2.content > 0 && message2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return message.channel.send('Valeur entrée invalide, annulation de la sélection vidéo.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return message.channel.send("🆘 Je n'ai pas pu obtenir de résultats de recherche.");
				}
			}
			return handleVideo(video, message, voiceChannel);
		}



	} else if (command === 'skip') {
		if (!message.member.voiceChannel) return message.channel.send("Vous n'êtes pas dans un channel vocal!");
		if (!serverQueue) return message.channel.send("Il n'y a rien que je puisse joué pour vous.");
		serverQueue.connection.dispatcher.end('La commande de skip a été utilisée!');
		return undefined;



	} else if (command === 'stop') {
		if (!message.member.voiceChannel) return message.channel.send("Vous n'êtes pas dans un channel vocal!");
		if (!serverQueue) return message.channel.send("Il n'y a rien que je puisse joué pour vous.");
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('La commande de stop a été utilisée!');
		client.user.setActivity("le chat", {type: "WATCHING"})
		return undefined;



	} else if (command === 'volume') {
		if (!message.member.voiceChannel) return message.channel.send("Vous n'êtes pas dans un channel vocal!");
		if (!serverQueue) return message.channel.send('Rien à joué.');
		if (!args[1]) return message.channel.send(`Le volume actuel est de: **${serverQueue.volume}/10**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 25);
		return message.channel.send(`Le volume nouveau volume est de: **${args[1]}/10**`);



	} else if (command === 'np') {
		if (!serverQueue) return message.channel.send('Rien à joué.');
		return message.channel.send(`🎶 Lecture en cours: **${serverQueue.songs[0].title}**`);



	} else if (command === 'queue') {
		if (!serverQueue) return message.channel.send('Rien à joué.');
		return message.channel.send(`
__**liste de lecture:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
\n__**Lecture en cours:**__ ${serverQueue.songs[0].title}
		`);



	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return message.channel.send('⏸ Musique mis en pause!');
		}
		return message.channel.send('Rien à joué.');



	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return message.channel.send('▶ Reprise de la lecture!');
		}
		return message.channel.send('Rien à joué.');



	} else if (command === 'stat' || command === 'stats') {
		var userCreatDate = message.author.createdAt.toString().split(" ");
		
		const dateFormat = require('dateformat');

		const now = new Date();
		dateFormat(now, 'dddd dd mmmm yyyy, h:MM:ss TT');

		dateFormat.i18n = {
			dayNames: [
				'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam',
				'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
			],
			monthNames: [
				'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
				'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
			],
			timeNames: [
				'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
			]
		};

		if (args[1] === undefined) {
			var user = message.author
		} else {
			var user = message.mentions.users.first();
		}

		var nbmsg = db.get("nbmsg").filter({user: user.id, guild: msgserv}).find('nbmsg').value();
        var nbmsgs = Object.values(nbmsg);
		let member = message.guild.member(user);
		
		
		const millisCreated = new Date().getTime() - user.createdAt.getTime();
		const daysCreated = millisCreated / 1000 / 60 / 60 / 24;
	
		
		const millisJoined = new Date().getTime() - member.joinedAt.getTime();
		const daysJoined = millisJoined / 1000 / 60 / 60 / 24;
	
		
		let roles = member.roles.array().slice(1).sort((a, b) => a.comparePositionTo(b)).reverse().map(role => role.name);
		if (roles.length < 1) roles = ['None'];

        var stat_embed = new Discord.RichEmbed()
			.setColor("#04B404")
			.setAuthor(user.username, user.avatarURL)
            .addField("Nombre de message:", nbmsgs[2] )
			.addField("Date de création du compte:", dateFormat(user.createdAt, 'dddd dd mmmm yyyy, à H:MM:ss') + " (durée: " + daysCreated.toFixed(0) + " jours)")
			.addField("Date d'entrée sur le serveur:", dateFormat(member.joinedAt, 'dddd dd mmmm yyyy, à H:MM:ss') + " (durée: " + daysJoined.toFixed(0) + " jours)")
			.addField("Roles:", roles.join(', '), false)
			message.channel.send(stat_embed)
			


		} else if (command === 'ping' || command === 'pong') {
			var ping = message.client.ping
			var pings = Math.round(ping)
			message.channel.send("Pong! `("+pings+"ms)`");
			


		} else if (command === 'help') {
        var help_embed = new Discord.RichEmbed()
			.setColor("#A901DB")
			.setAuthor("Liste des Commandes:")
			.addBlankField(true)
			.addField("__**Gestion:**__", "_________________________________")
			.addField("!help", "Affiche la liste des commandes")
			.addField("!stat", "Affiche vos statistiques")
			.addField("!clear", "Vous permet de supprimé des messages")
			.addField("!ping", "Affiche vôtre ping")
			.addField("!infoserv", "Affiche des informations sur le serveur")
			.addField("!infobot", "Affiche des informations sur le bot")
			.addBlankField(true)
			.addField("__**Musique:**__", "_________________________________")
			.addField("!play:", "Permet de joué une musique (aliase !p)")
			.addField("!stop:", "Supprime la liste de lecture et déconnecte le bot")
			.addField("!skip:", "Passer à la chansson suivante")
			.addField("!volume:", "Permet de régler le volume du bot")
			.addField("!np:", "Affiche la musique en cours de lecture")
			.addField("!queue:", "Affiche la liste de lecture")
			.addField("!pause:", "Mes la musique en pause")
			.addField("!resume:", "Relace la musique")
			.addBlankField(true)
			.addField("__**Fun:**__", "_________________________________")
			.addField("!roll:", "Fait un lancé de dé")
			.addField("!emoji:", "Affiche tous les emoji disponible")
			.addField("!cookie:", "COOKIE!!!")
		message.author.send(help_embed)
		message.reply("Je vous ai envoyer les commandes en DM!")
		


	} else if (command === 'roll') {
        min = Math.ceil(1);
        max = Math.floor(7);
        dice = Math.floor(Math.random() * (max - min) + min);
		message.channel.send("Number: " + dice)
		


	} else if (command === 'lol') {
        message.channel.send('<:LoL:404406306527772672> @everyone')
	} else if (command === 'rl') {
        message.channel.send(" <:RL:410011050612883456> @everyone")
	} else if (command === 'ark') {
		message.channel.send(" <:ARK:410011039606767616> @everyone")
		


	} else if (command === 'emoji') {
		const emojiList = message.guild.emojis.map(e=>e.toString()).join(" ");
		if (emojiList === ""){
			message.channel.send("Pas d'emoji disponible!")
		} else {
			message.channel.send(emojiList);			
		}
		
		

	} else if (command === 'clear') {

		var clearargs = message.content.substring(PREFIX.length + 6);
		const permissions = message.channel.permissionsFor(message.member);
		
		if (!permissions.has('MANAGE_MESSAGES')) {
			message.channel.send("Vous n'avez pas la permissions!");
			setTimeout(function(){
				message.channel.bulkDelete(2);
			}, 2000);
			return
		}

        if (args[1] === undefined){
            var clear_embed = new Discord.RichEmbed()
            .setColor("#FF0000")
            .setTitle("Veuilez indiqué le nombre de message a supprimé (1 à 100)")
            message.channel.send(clear_embed)
            setTimeout(function(){
                message.channel.bulkDelete(2);  
            }, 2000); 
        }else{
			var argsdel = Math.round(args[1]) + 1
			message.channel.bulkDelete(argsdel);
            var clear_embed = new Discord.RichEmbed()
            .setColor("#FF0000")
            .setTitle(`${args[1]} messages on été supprimé.`)
            message.channel.send(clear_embed)
            setTimeout(function(){
                message.channel.bulkDelete(1);  
            }, 2000);            
		}
		


	} else if (command === 'cookie') {
		var cookie_embed = new Discord.RichEmbed()
		.setImage("https://vignette.wikia.nocookie.net/lego/images/b/b3/20120315192444%21Cookie.png/revision/latest?cb=20120315193153")
		message.channel.send(cookie_embed)
		


	} else if (command === 'infobot') {
		var info_embed = new Discord.RichEmbed()
		.setColor("#00FFFF")
		.setAuthor("Njörd", "https://cdn.discordapp.com/avatars/409915910044909581/4798d4effbb19965436d342259dc2274.png")
		.addField("Utilisateur:", client.guilds.reduce((mem, g) => mem += g.memberCount, 0))
		.addField("Serveurs:", client.guilds.size.toLocaleString())
		.addField("Channels:", client.channels.size.toLocaleString())
		.addField("RAM:", (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + " MB")
		.setFooter("© Kikipunk 2018")
		message.channel.send(info_embed)



	} else if (command === "infoserv") {

		const dateFormat = require('dateformat');

		const now = new Date();
		dateFormat(now, 'dddd dd mmmm yyyy, h:MM:ss TT');

		dateFormat.i18n = {
			dayNames: [
				'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam',
				'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
			],
			monthNames: [
				'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
				'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
			],
			timeNames: [
				'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
			]
		};
		
		if (!message.guild) {
			var servinfoerror_embed = new Discord.RichEmbed()
			.setColor("#FF0000")
			.setTitle("Cela ne peut être utilisé que sur un serveur!")
			message.channel.send(servinfoerror_embed)
			setTimeout(function(){
				message.channel.bulkDelete(2);  
			}, 2000); 
		}
		const millis = new Date().getTime() - message.guild.createdAt.getTime();
		const days = millis / 1000 / 60 / 60 / 24;
	
		const owner = message.guild.owner.user || {};
	
		const verificationLevels = ['Aucun', 'Faible', 'Moyen', 'Insane', 'Extreme'];
	
		var servinfo_embed = new Discord.RichEmbed()
			.setColor("#0040FF")
			.setAuthor(message.guild.name, message.guild.iconURL)
			.addField("Créé le:", dateFormat(message.guild.createdAt, 'dddd dd mmmm yyyy, à H:MM:ss') + " (uptime: " + days.toFixed(0) + " jours)")
			.addField("Par:", owner.username)
			.addField("Region du serveur:", message.guild.region)
			.addField("Nombres de membres:", message.guild.members.filter(m => m.presence.status !== 'offline').size + "/" + message.guild.memberCount)
			.addField("Channels textuelle :", message.guild.channels.filter(m => m.type === 'text').size)
			.addField("Channels vocal:", message.guild.channels.filter(m => m.type === 'voice').size)
			.addField("Niveau de vérification:", verificationLevels[message.guild.verificationLevel])
			.addField("Rôles:", message.guild.roles.size)
			message.channel.send(servinfo_embed)
	}
	return undefined;
});

async function handleVideo(video, message, voiceChannel, playlist = false) {
	const serverQueue = queue.get(message.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: message.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(message.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(message.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Je ne peu pas rejoindre le channel vocal: ${error}`);
			queue.delete(message.guild.id);
			return message.channel.send(`Je ne peu pas rejoindre le channel vocal: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return message.channel.send(`✅ **${song.title}** a été ajouté à la liste de lecture!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		client.user.setPresence({status: 'idle', game: { name: 'le chat', type: 3} });
		serverQueue.textChannel.send(`❎ Fin de la liste de lecture **Déconnection**`);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 25);

	serverQueue.textChannel.send(`🎶 Lancement de: **${song.title}**`);
	client.user.setPresence({status: 'online', game: { name: song.title , type: 2} });
	console.log("set presence to: " + song.title);
}

client.login(TOKEN);