// Importation des modukes nécessaires
const express = require('express');
const app = express();
const http = require("http");
const {Server}=require("socket.io");
const axios =require("axios")
const cors = require("cors");
// Activation de CORS pour autoriser les requêtes depuis un autre domaine
app.use(cors());
// Création d'un serveur HTTP à partir de l'application Express
const server = http.createServer(app);

const apiUrl = 'http://localhost:3500';


// Création d'une instance de Socket.IO en configurant CORS
const io = new Server(server,{
    cors:{
        origin:'https://quizzeo.onrender.com',
        methods: ["GET","POST"],
        headers:{'Access-Control-Allow-Origin': 'https://quizzeo.onrender.com'},
        withCredentials: true
    }
}); 


// Définition d'un objet pour stocker les quizzs en cours
let quizzs = {};


// Fonction pour créer un objet quiz en fonction du type
function createQuizz(data) {
    const commonData = {
        email: data.email,
        participants: [],
        session_name: data.session_name,
        quizz_data: data.quizz_data,
        quizz_type: data.quizz_type,
        reponses: [],
    };

    switch (data.quizz_type) {
        case 'timer':
        return {
            ...commonData,
            cmp: 0,
            index: 0,
            currResponse: [],
            nbCurrResponse: 0,
            timer: data.timer,
        };
        case 'participant':
        return {
            ...commonData,
            cmp: 0,
        };
        default:
        return {
            ...commonData,
            cmp: 0,
            index: 0,
            currResponse: [],
            nbCurrResponse: 0,
        };
    }
}



// Fonction pour envoyer les données du quiz à l'administrateur
function sendQuizzDataToAdmin(socket, quizz_link) {
    const commonData = {
      quizz_data: quizzs[quizz_link].quizz_data,
      quizz_type: quizzs[quizz_link].quizz_type,
      nb_user: (io.sockets.adapter.rooms.get(quizz_link).size) - 1,
      nb_response: quizzs[quizz_link].cmp,
    };
  
    const sendData = quizzs[quizz_link].quizz_type === 'participant'
      ? commonData
      : {
          ...commonData,
          index: quizzs[quizz_link].index,
          currResponse: quizzs[quizz_link].currResponse,
          nbCurrResponse: quizzs[quizz_link].nbCurrResponse,
        };
  
    socket.emit('send_quizz_data', sendData);
  }

// Définition d'une fonction pour générer une chaîne de caractères aléatoire 
//pour les identifiants de quizzs
function generateRandomString() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < 10; i++) {
      randomString += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return randomString.toLowerCase();
}

/* Fonction pour vérifier si un utilisateur 
est autorisé à accéder à la page d'admin d'un quiz*/

function checkRoom(quizz_link, email) {
    return quizz_link in quizzs && quizzs[quizz_link].email === email;
}


// Fonction pour obtenir la date formatée
function getFormattedDate() {
    const now = new Date();
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return now.toLocaleString('fr-FR', options);
}

const findArrayWithElement = (object, searchElem) => {
    for (let key in object) {
        if (object[key].hasOwnProperty('participants') && object[key].participants.includes(searchElem)) {
            let index =  object[key].participants.indexOf(searchElem);
            object[key].participants.splice(index, 1);
            return key;
        }
    }
    return null;
};

const formatResult = (data) =>{
    const result = data.reduce((acc, {id, reponse, disabled}) => {
        const obj = acc.find(x => x.id === id);
        if (obj) {
            reponse.forEach(r => {
                if (obj.reponse[r]) {
                obj.reponse[r]++;
                } else {
                obj.reponse[r] = 1;
                }
            });
        } else {
            const newEntry = {id, reponse: {}};
            reponse.forEach(r => newEntry.reponse[r] = 1);
            acc.push(newEntry);
        }
        return acc;
    }, []);
    
    return result ;
}



/**********************************************************************
 ***                      Gestion des websockets                    ***
 **********************************************************************/

// réception d'une connexion
io.on("connection",(socket)=>{
    console.log("joined : "+socket.id)

    // Géstion de l'événement de démarrage d'un quizz
    socket.on("start_quizz",(data)=>{
        const quizz_link = generateRandomString();
        const quizz = createQuizz(data);
        quizzs[quizz_link] = quizz;
        socket.join(quizz_link);
        
        console.log(`Admin with ID: ${socket.id} joined room: ${quizz_link}`);
        socket.emit('quizz_started', { quizz_link: quizz_link });
    });

    // Géstion de l'événement de connexion d'un administrateur à un quizz
    socket.on("admin_joined",(data)=>{
        if (checkRoom(data.quizz_link, data.email)) {
            socket.join(data.quizz_link);
            sendQuizzDataToAdmin(socket, data.quizz_link);

            if (quizzs[data.quizz_link].quizz_type === 'timer') {
                socket.emit('give_timer', { timer: quizzs[data.quizz_link].timer });
            }
        } else {
            socket.emit('quizz_not_exist_or_not_admin');
        }
        
    });

    // Géstion de l'événement de fin d'un quizz
    socket.on("end_quizz",(data)=>{
        if (data.quizz_link in quizzs) {
            const quizz = quizzs[data.quizz_link];
            console.log(formatResult(quizz.reponses));
            console.log(quizz.quizz_data._id);
            console.log(quizz.cmp);
            console.log(quizz.session_name);
            
            const formattedDate = getFormattedDate();
            console.log(formattedDate);
        
            socket.emit('quizz_ended', { quizz_link: data.quizz_link });
            socket.to(data.quizz_link).emit('quizz_ended');
            
            delete quizzs[data.quizz_link];
            socket.leave(data.quizz_link);
            console.log(`Admin with ID: ${socket.id} leave room: ${data.quizz_link}`);
        }
    });

    //Gestion de l'evenement lorsqu'un utilisateur rejoin le quizz
    socket.on("join_quizz",(data)=>{
        //si le quizz exist
        if(data.quizz_link in quizzs){
            const quizz = quizzs[data.quizz_link];

            // L'utilisateur rejoint le quiz
            socket.join(data.quizz_link);
            quizz.participants.push(socket.id);
            socket.to(data.quizz_link).emit('user_join_or_left', { nb_user: (io.sockets.adapter.rooms.get(data.quizz_link).size) - 1 });
            console.log(`User with ID: ${socket.id} joined room: ${data.quizz_link}`);

            if (quizz.quizz_type === 'timer') {
                socket.emit('give_counter', { timer: quizz.timer });
            }

            if (quizz.quizz_type === 'participant') {
                // Envoie de toutes les questions à l'utilisateur
                socket.emit('send_quizz_data', { quizz_data: quizz.quizz_data, quizz_type: quizz.quizz_type });
            } else {
                // Envoie de la question courante
                const curr_index = quizz.index;
                const curr_question = quizz.quizz_data.questions[curr_index];
                const quizzWithOnlyCurrentQuestion = { ...quizz.quizz_data, questions: [curr_question] };

                socket.emit('send_curr_question_and_data', {
                    quizz_data: quizzWithOnlyCurrentQuestion,
                    quizz_type: quizz.quizz_type,
                    nb_questions: quizz.quizz_data.questions.length,
                    index: quizz.index,
                });
            }

        //Si le quizz n'existe pas envoie d'une socket pour prevenir l'utilisateur
        }else{
            socket.emit("quizz_not_exist")
        }
           
    });

    //Gestion de l'evenement de passage à la question suivantz
    socket.on("give_next_question",(data)=>{
        if(data.quizz_link in quizzs){
            const quizz = quizzs[data.quizz_link];
            quizz.index = data.index;
            quizz.nbCurrResponse = 0;
            quizz.currResponse = [];
        
            const next_question = quizz.quizz_data.questions[data.index];
            const quizzNextQuestion = { ...quizz.quizz_data, questions: [next_question] };
        
            socket.to(data.quizz_link).emit('next_question', { quizz_data: quizzNextQuestion, index: quizz.index });
        }
    })
    

    // Gestion de l'événement lorsqu'un utilisateur quitte un quiz
    socket.on('leave_quizz', (data) => {
        console.log(`User with ID: ${socket.id} leave room: ${data.quizz_link}`);
        socket.leave(data.quizz_link);
        if (io.sockets.adapter.rooms.get(data.quizz_link)) {
        socket.to(data.quizz_link).emit('user_join_or_left', { nb_user: (io.sockets.adapter.rooms.get(data.quizz_link).size) - 1 });
        }
    });


    // Gestion de l'événement d'envoi des réponses d'un utilisateur
    socket.on('send_response_finish', (data) => {
        if (data.quizz_link in quizzs) {
            const quizz = quizzs[data.quizz_link];
            data.questions_response.forEach(element => {
                quizz.reponses.push(element);
            });
        
            socket.emit('reponse_recieved');
            quizz.cmp++;
            socket.to(data.quizz_link).emit('nb_user_responses', { quizz_link: data.quizz_link, nb_response: quizz.cmp });
        }
    });

    // Gestion de l'événement lorsqu'un participant termine le quiz
    socket.on('participant_finish', (data) => {
        const quizz = quizzs[data.quizz_link];
        quizz.cmp++;
        socket.to(data.quizz_link).emit('nb_user_responses', { quizz_link: data.quizz_link, nb_response: quizz.cmp });
    });

    socket.on("responded",(data)=>{
        if(data.quizz_link in quizzs){
            const quizz = quizzs[data.quizz_link];

            if(quizzs[data.quizz_link].quizz_type==="timer" && quizzs[data.quizz_link].timer>0){
                socket.to(data.quizz_link).emit("user_responded",{response:data.response})
            }else{
                socket.to(data.quizz_link).emit("user_responded",{response:data.response})
            }

            // Met à jour le quizz
            quizz.currResponse = quizz.currResponse.concat(data.response);
            quizz.nbCurrResponse++;
            quizz.reponses.push(data.question_with_response);
        }
    })

    socket.on("set_timer",(data)=>{
        if (data.quizz_link in quizzs) {
            const quizz = quizzs[data.quizz_link];
            quizz.timer = data.timer;
            socket.to(data.quizz_link).emit('give_counter', { timer: quizz.timer });
        }
    })



    // Géstion de l'événement de déconnexion d'un utilisateur
    //Si l'utilisateur est le créateur on met fin au quizz
    socket.on("disconnect", ()=>{
        const quizz_link=findArrayWithElement(quizzs,socket.id)
        if(quizz_link!==null){
            if (io.sockets.adapter.rooms.has(quizz_link)) {
                const nbUsers = io.sockets.adapter.rooms.get(quizz_link).size - 1;
                socket.to(quizz_link).emit("user_join_or_left", { nb_user: nbUsers });
            }
        }
        console.log("deco : "+socket.id)
    });
});


// Lancement du serveur sur le port 3001
server.listen(()=>{
    console.log("SERVER IS RUNNING");
})