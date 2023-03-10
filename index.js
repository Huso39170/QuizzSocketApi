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
        origin:'http://localhost:3000',
        methods: ["GET","POST"]
    }
}); 


// Définition d'un objet pour stocker les quizzs en cours
let quizzs = {};

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

// Définition d'une fonction pour vérifier si un utilisateur 
//est autorisé à accéder à la page d'admin d'un quizz
function checkRoom (quizz_link,admin){
    if (quizz_link in quizzs) {
        if(quizzs[quizz_link].creator===admin){
            return true
        }else{
            return false
        }
    } else {
        return false
    }
}


// Définition d'une fonction pour vérifier si le quizz est lancer
function checkQuizz(quizz_link){
    if (quizz_link in quizzs) {
        return true
    } else {
        return false
    }
}

function getKeyByCreator(object, value) {
    return Object.keys(object).find(key => object[key].creator === value);
}

const findArrayWithElement = (object, searchElem) => {
    for (let key in object) {
        if (object[key].hasOwnProperty('particpant') && object[key].particpant.includes(searchElem)) {
            let index =  object[key].particpant.indexOf(searchElem);
            object[key].particpant.splice(index, 1);
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
        let quizz_link = generateRandomString();
        if(data.quizz_type==="timer"){
            quizzs[quizz_link]={
                creator:socket.id,
                particpant:[],
                cmp:0,
                index:0,
                quizz_data:data.quizz_data,
                quizz_type:data.quizz_type,
                timer:data.timer,
                reponses:[]}
        }else if(data.quizz_type==="participant"){
            quizzs[quizz_link]={
                creator:socket.id,
                particpant:[],
                cmp:0,
                quizz_data:data.quizz_data,
                quizz_type:data.quizz_type,
                reponses:[]}
        }else{
            quizzs[quizz_link]={
                creator:socket.id,
                particpant:[],
                cmp:0,
                index:0,
                quizz_data:data.quizz_data,
                quizz_type:data.quizz_type,
                reponses:[]}
        }
        socket.join(quizz_link);
        console.log(`Admin with ID: ${socket.id} joined room: ${quizz_link}`);
        socket.emit("quizz_started",{quizz_link:quizz_link})
    });

    // Géstion de l'événement de connexion d'un administrateur à un quizz
    socket.on("admin_joined",(data)=>{
        let verif= checkRoom(data.quizz_link,socket.id)
        if (verif) {
            socket.emit("send_quizz_data",{quizz_data:quizzs[data.quizz_link].quizz_data,
                                            quizz_type:quizzs[data.quizz_link].quizz_type,
                                            nb_response:quizzs[data.quizz_link].cmp});
            if(quizzs[data.quizz_link].quizz_type==="timer"){
                socket.emit("give_timer",{timer:quizzs[data.quizz_link].timer})
            }
        }else{
            socket.emit("quizz_not_exist_or_not_admin")
        }
        
    });

    // Géstion de l'événement de fin d'un quizz
    socket.on("end_quizz",(data)=>{
        if (data.quizz_link in quizzs) {
            console.log(formatResult(quizzs[data.quizz_link].reponses))
            socket.emit("quizz_ended",{quizz_link:data.quizz_link})
            socket.to(data.quizz_link).emit("quizz_ended")
            delete quizzs[data.quizz_link]
            socket.leave(data.quizz_link);
            console.log(`Admin with ID: ${socket.id} leave room: ${data.quizz_link}`);
        }
    });

    //Gestion de l'evenement lorsqu'un utilisateur rejoin le quizz
    socket.on("join_quizz",(data)=>{
        //Verification de l'existance du quizz
        const result=checkQuizz(data.quizz_link);
        //si le quizz exist
        if(result){
            //L'utilisateur rejoin le quizz
            socket.join(data.quizz_link);

            quizzs[data.quizz_link].particpant.push(socket.id);

            socket.to(data.quizz_link).emit("user_join_or_left",{nb_user:(io.sockets.adapter.rooms.get(data.quizz_link).size)-1})
            console.log(`User with ID: ${socket.id} joined room: ${data.quizz_link}`);

            if(quizzs[data.quizz_link].quizz_type==="timer"){
                socket.emit("give_counter",{timer: quizzs[data.quizz_link].timer})
            }

            //Si le quizz est en mode participant quiz passe
            if(quizzs[data.quizz_link].quizz_type==="participant"){
                //Envoie de tt les questions à l'utilisateur
                socket.emit("send_quizz_data",{quizz_data:quizzs[data.quizz_link].quizz_data,quizz_type:quizzs[data.quizz_link].quizz_type});
            }else{
                //Sinon envoie de la question courrante
                let currIndex=quizzs[data.quizz_link].index
                let curr_question =  quizzs[data.quizz_link].quizz_data.questions[currIndex]
                let quizz_with_only_curr_question = Object.assign({}, quizzs[data.quizz_link].quizz_data);
                delete quizz_with_only_curr_question.questions;
                quizz_with_only_curr_question["questions"]=[curr_question];
                socket.emit("send_curr_question_and_data",{quizz_data : quizz_with_only_curr_question
                                                            ,quizz_type : quizzs[data.quizz_link].quizz_type
                                                            ,nb_questions:quizzs[data.quizz_link].quizz_data.questions.length
                                                            ,index:quizzs[data.quizz_link].index});
            }

        //Si le quizz n'existe pas envoie d'une socket pour prevenir l'utilisateur
        }else{
            socket.emit("quizz_not_exist")
        }
           
    });

    //Gestion de l'evenement de passage à la question suivantz
    socket.on("give_next_question",(data)=>{
        if(data.quizz_link in quizzs){
            quizzs[data.quizz_link].index=data.index;
            let next_question =  quizzs[data.quizz_link].quizz_data.questions[data.index]
            let quizz_next_question = Object.assign({}, quizzs[data.quizz_link].quizz_data);
            delete quizz_next_question.questions;
            quizz_next_question["questions"]=[next_question];
            socket.to(data.quizz_link).emit("next_question",{quizz_data:quizz_next_question,index:quizzs[data.quizz_link].index})
        }
    })

    socket.on("leave_quizz",(data)=>{
        console.log(`User with ID: ${socket.id} leave room: ${data.quizz_link}`);
        socket.leave(data.quizz_link);
        if(io.sockets.adapter.rooms.get(data.quizz_link))(
            socket.to(data.quizz_link).emit("user_join_or_left",{nb_user:(io.sockets.adapter.rooms.get(data.quizz_link).size)-1})
        )
    });

    socket.on("send_response_finish",(data)=>{
        if(data.quizz_link in quizzs){
            data.questions_response.forEach(element => {
                quizzs[data.quizz_link].reponses.push(element)
            });
            socket.emit("reponse_recieved");
            quizzs[data.quizz_link].cmp++;
            socket.to(data.quizz_link).emit("nb_user_responses",{quizz_link:data.quizz_link,nb_response:quizzs[data.quizz_link].cmp})
        }

    })

    socket.on("responded",(data)=>{
        if(data.quizz_link in quizzs){
            if(quizzs[data.quizz_link].quizz_type==="timer" && quizzs[data.quizz_link].timer>0){
                socket.to(data.quizz_link).emit("user_responded",{response:data.response})
                quizzs[data.quizz_link].reponses.push(data.question_with_response)
                console.log(quizzs[data.quizz_link].reponses)
            }else{
                socket.to(data.quizz_link).emit("user_responded",{response:data.response})
                quizzs[data.quizz_link].reponses.push(data.question_with_response)
                console.log(quizzs[data.quizz_link].reponses)

            }
        }
    })

    socket.on("set_timer",(data)=>{
        if(data.quizz_link in quizzs){
            quizzs[data.quizz_link].timer=data.timer;
            socket.to(data.quizz_link).emit("give_counter",{timer: quizzs[data.quizz_link].timer})
        }
    })



    // Géstion de l'événement de déconnexion d'un utilisateur
    //Si l'utilisateur est le créateur on met fin au quizz
    socket.on("disconnect", ()=>{
        const quizz_link =getKeyByCreator(quizzs,socket.id);
        if(quizz_link in quizzs){
            socket.emit("quizz_ended",{quizz_link:quizz_link})
            socket.to(quizz_link).emit("quizz_ended")
            delete quizzs[quizz_link]
            console.log(`Admin with ID: ${socket.id} leave room: ${quizz_link}`);
        }
        
        
        const quizz_link_2=findArrayWithElement(quizzs,socket.id)
        if(quizz_link_2!==null){
            socket.to(quizz_link_2).emit("user_join_or_left",{nb_user:(io.sockets.adapter.rooms.get(quizz_link_2).size)-1})
        }
        console.log("deco : "+socket.id)
    });
});


// Lancement du serveur sur le port 3001
server.listen(3001,()=>{
    console.log("SERVER IS RUNNING");
})